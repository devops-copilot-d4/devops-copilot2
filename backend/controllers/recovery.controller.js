/**
 * Recovery Controller
 *
 * Fixes:
 *  - SLO scoping: now queries by service ID (not a bare findOne({}))
 *  - executionLog captured from k8s responses
 *  - approvedAt timestamp recorded
 *  - ttr (time-to-resolve) written on incident close
 */

const RecoveryAction = require('../models/RecoveryAction');
const Incident       = require('../models/Incident');
const Service        = require('../models/Service');
const SLO            = require('../models/SLO');
const k8sService     = require('../services/k8s.service');
const { checkSLO }   = require('../services/prometheus.service');
const { explainRecoveryDecision } = require('../services/llm.service');
const { emitEvent }  = require('../services/socket.service');
const logger         = require('../config/logger');

const HIGH_IMPACT_ACTIONS = ['rollback', 'scale_down'];

// ─── create ──────────────────────────────────────────────────────────────────

const createRecoveryAction = async (req, res, next) => {
  try {
    const { incidentId, actionType, businessImpact } = req.body;

    const incident = await Incident.findById(incidentId).populate('service');
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    const reason = await explainRecoveryDecision({
      rootCause:      incident.rootCause,
      actionType,
      businessImpact: businessImpact || 'unspecified',
      serviceName:    incident.service?.name,
    });

    const requiresApproval = HIGH_IMPACT_ACTIONS.includes(actionType);

    const action = await RecoveryAction.create({
      incident:   incident._id,
      service:    incident.service._id,
      actionType,
      reason,
      requiresApproval,
      status: requiresApproval ? 'pending_approval' : 'executing',
    });

    // Update incident status
    incident.status = 'recovering';
    await incident.save();

    emitEvent('recovery:new', { actionId: action._id, actionType, requiresApproval });

    if (!requiresApproval) {
      // Fire and forget — don't block the HTTP response
      executeAction(action).catch(err =>
        logger.error(`[recovery] executeAction failed: ${err.message}`)
      );
    }

    res.status(201).json(action);
  } catch (err) {
    next(err);
  }
};

// ─── approve ─────────────────────────────────────────────────────────────────

const approveRecoveryAction = async (req, res, next) => {
  try {
    const action = await RecoveryAction.findById(req.params.id);
    if (!action) return res.status(404).json({ message: 'Recovery action not found' });
    if (action.status !== 'pending_approval') {
      return res.status(400).json({ message: `Action is already in status: ${action.status}` });
    }

    action.approvedBy = req.user.id;
    action.approvedAt = new Date();
    action.status     = 'executing';
    await action.save();

    executeAction(action).catch(err =>
      logger.error(`[recovery] executeAction (post-approval) failed: ${err.message}`)
    );

    res.json(action);
  } catch (err) {
    next(err);
  }
};

// ─── internal executor ───────────────────────────────────────────────────────

const executeAction = async (action) => {
  const startedAt = Date.now();
  const service   = await Service.findById(action.service);
  const params    = { deploymentName: service.deploymentName, namespace: service.namespace };

  try {
    let k8sResult = {};

    switch (action.actionType) {
      case 'restart':
        k8sResult = await k8sService.restartDeployment(params);
        break;
      case 'rollback':
        k8sResult = await k8sService.rollbackDeployment(params);
        break;
      case 'scale_up':
        k8sResult = await k8sService.scaleDeployment({ ...params, replicas: 3 });
        break;
      case 'scale_down':
        k8sResult = await k8sService.scaleDeployment({ ...params, replicas: 1 });
        break;
      case 'alert_only':
      default:
        k8sResult = { status: 'alert_sent' };
        break;
    }

    // Wait 30s for the cluster to stabilise before checking SLO
    await new Promise(r => setTimeout(r, 30_000));

    // ── SLO verification: scoped to this incident's service ──────────────────
    const slo = await SLO.findOne({ service: action.service }).sort({ createdAt: -1 });
    let verified = false;

    if (slo?.queryExpression) {
      const result = await checkSLO({
        queryExpression: slo.queryExpression,
        threshold:       slo.threshold,
        comparator:      slo.comparator,
      });
      verified = result.status === 'met';

      slo.status        = result.status;
      slo.lastCheckedAt = new Date();
      slo.lastValue     = result.value;
      await slo.save();
    }

    action.status              = 'success';
    action.requirementVerified = verified;
    action.executionLog        = JSON.stringify(k8sResult);
    action.duration            = Date.now() - startedAt;
    await action.save();

    // Close the incident if SLO is met
    const incident = await Incident.findById(action.incident);
    if (incident) {
      incident.status     = verified ? 'resolved' : 'recovering';
      incident.resolvedAt = verified ? new Date() : undefined;
      if (verified) {
        incident.ttr = Math.round((Date.now() - incident.createdAt.getTime()) / 1000);
      }
      await incident.save();
    }

    emitEvent('recovery:update', { actionId: action._id, status: 'success', verified });
    logger.info(`[recovery] ${action.actionType} on ${service.name} → success, SLO verified: ${verified}`);
  } catch (err) {
    action.status       = 'failed';
    action.executionLog = err.message;
    action.duration     = Date.now() - startedAt;
    await action.save();

    emitEvent('recovery:update', { actionId: action._id, status: 'failed', error: err.message });
    logger.error(`[recovery] ${action.actionType} on ${service?.name} → failed: ${err.message}`);
  }
};

// ─── list ─────────────────────────────────────────────────────────────────────

const getRecoveryActions = async (req, res, next) => {
  try {
    const { incidentId, serviceId, limit = 50 } = req.query;
    const filter = {};
    if (incidentId) filter.incident = incidentId;
    if (serviceId)  filter.service  = serviceId;

    const actions = await RecoveryAction.find(filter)
      .populate('incident service approvedBy')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(actions);
  } catch (err) {
    next(err);
  }
};

module.exports = { createRecoveryAction, approveRecoveryAction, getRecoveryActions };

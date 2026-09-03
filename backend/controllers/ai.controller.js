/**
 * AI Controller
 *
 * Orchestrates the full AI pipeline:
 *   POST /api/ai/rca           — run RCA on a deployment's logs
 *   POST /api/ai/slo           — convert NL requirement → SLO
 *   GET  /api/ai/incidents     — list all incidents
 *   GET  /api/ai/incidents/:id — single incident detail
 *   GET  /api/ai/health        — Ollama model health
 */

const Incident    = require('../models/Incident');
const Deployment  = require('../models/Deployment');
const SLO         = require('../models/SLO');
const Metric      = require('../models/Metric');
const Requirement = require('../models/Requirement');
const { analyzeRootCause, requirementToSLO, checkOllamaHealth } = require('../services/llm.service');
const { emitEvent } = require('../services/socket.service');
const logger        = require('../config/logger');
const axios         = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// ─── Root Cause Analysis ──────────────────────────────────────────────────────

const runRootCauseAnalysis = async (req, res, next) => {
  try {
    const { deploymentId, events, metricsSummary } = req.body;

    const deployment = await Deployment.findById(deploymentId).populate('service');
    if (!deployment) return res.status(404).json({ message: 'Deployment not found' });

    // 1. Run XGBoost failure prediction (Python AI microservice)
    let xgboostScore = null;
    try {
      const predRes = await axios.post(`${AI_SERVICE_URL}/predict`, {
        build_duration:  deployment.duration || 0,
        build_status:    deployment.buildStatus === 'failed' ? 1 : 0,
        deploy_status:   deployment.deployStatus === 'failed' ? 1 : 0,
        commit_sha_len:  (deployment.commitSha || '').length,
        retry_count:     0,
      }, { timeout: 10_000 });
      xgboostScore = predRes.data?.failure_probability;
    } catch (e) {
      logger.warn(`[ai.controller] XGBoost service unavailable: ${e.message}`);
    }

    // 2. Run LLM RCA
    const analysis = await analyzeRootCause({
      logs:           deployment.logs || '',
      events:         events || '',
      metricsSummary: metricsSummary || '',
    });

    // 3. Persist incident
    const incident = await Incident.create({
      service:           deployment.service._id,
      deployment:        deployment._id,
      type:              'runtime_failure',
      rootCause:         analysis.rootCause,
      affectedComponent: analysis.affectedComponent,
      confidence:        analysis.confidence,
      severity:          analysis.severity || 'medium',
      rawLogsSnapshot:   deployment.logs,
      xgboostScore,
      status:            'diagnosing',
    });

    // 4. Update deployment with failure score
    if (xgboostScore !== null) {
      deployment.failureScore = xgboostScore;
      await deployment.save();
    }

    emitEvent('incident:new', {
      incidentId:  incident._id,
      rootCause:   analysis.rootCause,
      severity:    analysis.severity,
      xgboostScore,
    });

    logger.info(`[ai.controller] RCA complete for deployment ${deploymentId} — ${analysis.rootCause}`);

    res.status(201).json({
      incident,
      suggestedAction: analysis.suggestedAction,
      xgboostScore,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Requirement → SLO ───────────────────────────────────────────────────────

const generateSLO = async (req, res, next) => {
  try {
    const { requirementId } = req.body;

    const requirement = await Requirement.findById(requirementId).populate('service');
    if (!requirement) return res.status(404).json({ message: 'Requirement not found' });

    const sloData = await requirementToSLO(requirement.description);

    // Create Metric record for the PromQL expression
    const metric = await Metric.create({
      service:         requirement.service._id,
      name:            sloData.metricName,
      queryExpression: sloData.promqlHint || sloData.metricName,
      unit:            sloData.unit,
      description:     `Auto-generated from requirement: ${requirement.title}`,
    });

    // Create SLO
    const slo = await SLO.create({
      requirement:     requirement._id,
      service:         requirement.service._id,
      metricName:      sloData.metricName,
      queryExpression: sloData.promqlHint || sloData.metricName,
      threshold:       sloData.threshold,
      comparator:      sloData.comparator,
      unit:            sloData.unit,
      promqlHint:      sloData.promqlHint,
    });

    // Update requirement status
    requirement.status = 'active';
    await requirement.save();

    res.status(201).json({ slo, metric, sloData });
  } catch (err) {
    next(err);
  }
};

// ─── Incidents list ───────────────────────────────────────────────────────────

const getIncidents = async (req, res, next) => {
  try {
    const { status, severity, serviceId, limit = 50 } = req.query;
    const filter = {};
    if (status)    filter.status   = status;
    if (severity)  filter.severity = severity;
    if (serviceId) filter.service  = serviceId;

    const incidents = await Incident.find(filter)
      .populate('service deployment slo')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(incidents);
  } catch (err) {
    next(err);
  }
};

const getIncidentById = async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('service deployment slo');
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    res.json(incident);
  } catch (err) {
    next(err);
  }
};

// ─── Ollama health ────────────────────────────────────────────────────────────

const getAIHealth = async (req, res, next) => {
  try {
    const health = await checkOllamaHealth();
    res.json(health);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  runRootCauseAnalysis,
  generateSLO,
  getIncidents,
  getIncidentById,
  getAIHealth,
};

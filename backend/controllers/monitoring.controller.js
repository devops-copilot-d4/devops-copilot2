/**
 * Monitoring Controller
 *
 * Bridges Prometheus data to the dashboard and the AI prediction pipeline.
 * Endpoints:
 *   GET /api/monitoring/metrics          — instant PromQL query
 *   GET /api/monitoring/metrics/range    — range query (for charts)
 *   GET /api/monitoring/slos             — all SLOs + current status
 *   POST /api/monitoring/slos/:id/check  — re-evaluate a single SLO now
 *   GET /api/monitoring/predict/:sloId   — LLM trend-based breach prediction
 *   GET /api/monitoring/health           — Ollama + Prometheus + K8s health
 */

const SLO            = require('../models/SLO');
const Incident       = require('../models/Incident');
const Service        = require('../models/Service');
const { queryInstant, queryRange, checkSLO } = require('../services/prometheus.service');
const { predictFailure, checkOllamaHealth }  = require('../services/llm.service');
const k8sService     = require('../services/k8s.service');
const { emitEvent }  = require('../services/socket.service');
const logger         = require('../config/logger');

// ─── instant PromQL ──────────────────────────────────────────────────────────

const queryMetric = async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: 'query param required' });
    const result = await queryInstant(query);
    res.json({ query, result });
  } catch (err) {
    next(err);
  }
};

// ─── range PromQL ─────────────────────────────────────────────────────────────

const queryMetricRange = async (req, res, next) => {
  try {
    const { query, start, end, step } = req.query;
    if (!query || !start || !end) {
      return res.status(400).json({ message: 'query, start, end params required' });
    }
    const result = await queryRange(query, start, end, step || '15s');
    res.json({ query, result });
  } catch (err) {
    next(err);
  }
};

// ─── SLO list ─────────────────────────────────────────────────────────────────

const getSLOs = async (req, res, next) => {
  try {
    const { serviceId } = req.query;
    const filter = serviceId ? { service: serviceId } : {};
    const slos = await SLO.find(filter)
      .populate('requirement service')
      .sort({ createdAt: -1 });
    res.json(slos);
  } catch (err) {
    next(err);
  }
};

// ─── re-check a single SLO ───────────────────────────────────────────────────

const checkSLONow = async (req, res, next) => {
  try {
    const slo = await SLO.findById(req.params.id).populate('service requirement');
    if (!slo) return res.status(404).json({ message: 'SLO not found' });

    const result = await checkSLO({
      queryExpression: slo.queryExpression,
      threshold:       slo.threshold,
      comparator:      slo.comparator,
    });

    slo.status        = result.status;
    slo.lastCheckedAt = new Date();
    slo.lastValue     = result.value;
    await slo.save();

    // Auto-open incident if SLO is now violated
    if (result.status === 'violated') {
      const existing = await Incident.findOne({
        slo:    slo._id,
        status: { $in: ['open', 'diagnosing', 'recovering'] },
      });

      if (!existing) {
        const incident = await Incident.create({
          service:  slo.service._id,
          slo:      slo._id,
          type:     'active_violation',
          severity: 'high',
          status:   'open',
        });
        emitEvent('incident:new', { incidentId: incident._id, sloName: slo.metricName });
        logger.warn(`[monitoring] SLO violated: ${slo.metricName} — incident ${incident._id} opened`);
      }
    }

    res.json({ slo, result });
  } catch (err) {
    next(err);
  }
};

// ─── LLM breach prediction ────────────────────────────────────────────────────

const predictSLOBreach = async (req, res, next) => {
  try {
    const slo = await SLO.findById(req.params.sloId);
    if (!slo) return res.status(404).json({ message: 'SLO not found' });

    // Fetch last 20 data points (last 5 minutes at 15s intervals)
    const end   = Math.floor(Date.now() / 1000);
    const start = end - 300;
    const rangeResult = await queryRange(slo.queryExpression, start, end, '15s');

    const recentValues = (rangeResult[0]?.values || []).map(([, v]) => parseFloat(v));
    if (recentValues.length < 3) {
      return res.status(422).json({ message: 'Not enough data points for prediction (need ≥3)' });
    }

    const prediction = await predictFailure({
      metricName:    slo.metricName,
      threshold:     slo.threshold,
      comparator:    slo.comparator,
      recentValues,
    });

    // If breach imminent and no open incident yet, pre-emptively open a predicted incident
    if (prediction.willBreach) {
      const existing = await Incident.findOne({
        slo:    slo._id,
        status: { $in: ['open', 'diagnosing', 'recovering'] },
      });
      if (!existing) {
        const incident = await Incident.create({
          service:  slo.service,
          slo:      slo._id,
          type:     'predicted_violation',
          severity: 'medium',
          status:   'open',
          rootCause: prediction.trendDescription,
          confidence: prediction.confidence,
        });
        emitEvent('incident:predicted', { incidentId: incident._id, prediction });
      }
    }

    res.json({ slo, prediction, dataPoints: recentValues.length });
  } catch (err) {
    next(err);
  }
};

// ─── system health ────────────────────────────────────────────────────────────

const getSystemHealth = async (req, res, next) => {
  try {
    const [ollamaHealth, promResult] = await Promise.allSettled([
      checkOllamaHealth(),
      queryInstant('up'),
    ]);

    const ollama     = ollamaHealth.status === 'fulfilled' ? ollamaHealth.value : { ok: false };
    const prometheus = promResult.status   === 'fulfilled' ? { ok: true }      : { ok: false };

    // K8s: try listing default namespace deployments
    let kubernetes = { ok: false };
    try {
      await k8sService.listDeployments({ namespace: 'default' });
      kubernetes = { ok: true };
    } catch { /* k8s not available in dev */ }

    res.json({
      timestamp: new Date(),
      services: {
        ollama:     { ...ollama,     status: ollama.ok     ? 'healthy' : 'unreachable' },
        prometheus: { ...prometheus, status: prometheus.ok ? 'healthy' : 'unreachable' },
        kubernetes: { ...kubernetes, status: kubernetes.ok ? 'healthy' : 'unreachable' },
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  queryMetric,
  queryMetricRange,
  getSLOs,
  checkSLONow,
  predictSLOBreach,
  getSystemHealth,
};

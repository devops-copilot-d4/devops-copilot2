/**
 * LLM Service — Ollama (Llama 3 / Gemma) integration
 *
 * All AI inference runs locally via Ollama. No external API keys needed.
 * Models: llama3, gemma:7b, mistral — configurable via env vars.
 *
 * Functions:
 *   requirementToSLO       — NL requirement → measurable SLO (JSON)
 *   analyzeRootCause       — logs + events + metrics → RCA (JSON)
 *   explainRecoveryDecision — action + context → plain-English justification
 *   predictFailure         — metric trend → breach prediction (JSON)
 */

const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const RCA_MODEL       = process.env.OLLAMA_RCA_MODEL       || 'llama3';
const PREDICT_MODEL   = process.env.OLLAMA_PREDICT_MODEL   || 'llama3';
const EXPLAIN_MODEL   = process.env.OLLAMA_EXPLAIN_MODEL   || 'gemma:7b';
const SLO_MODEL       = process.env.OLLAMA_SLO_MODEL       || 'llama3';

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Call Ollama's /api/generate endpoint with a prompt.
 * Returns the full response string.
 */
const callOllama = async (model, prompt, options = {}) => {
  try {
    const response = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.1, // low temp for structured JSON
          num_predict: options.maxTokens ?? 1024,
        },
      },
      { timeout: 120_000 } // LLMs can be slow on first call
    );
    return response.data?.response?.trim() || '';
  } catch (err) {
    const msg = err?.response?.data?.error || err.message;
    throw new Error(`[llm.service] Ollama call failed (model=${model}): ${msg}`);
  }
};

/**
 * Strip markdown code fences and parse JSON safely.
 */
const parseJSON = (raw) => {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  // Extract first JSON object or array from the response
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error(`[llm.service] No valid JSON found in LLM response:\n${raw}`);
  return JSON.parse(match[0]);
};

// ─── exported functions ─────────────────────────────────────────────────────

/**
 * Convert a natural-language business requirement into a measurable SLO.
 *
 * @param {string} requirementText
 * @returns {{ metricName, comparator, threshold, unit, promqlHint }}
 */
const requirementToSLO = async (requirementText) => {
  const prompt = `
You are a Site Reliability Engineer. Convert the business requirement below into a
measurable Service Level Objective (SLO).

Respond ONLY with a single JSON object — no markdown, no explanation:
{
  "metricName": "<prometheus metric name>",
  "comparator": "<|<=|>|>=|==",
  "threshold": <number>,
  "unit": "<ms|%|req/s|errors/min|...>",
  "promqlHint": "<example PromQL expression to measure this>"
}

Business Requirement: "${requirementText}"
`.trim();

  const raw = await callOllama(SLO_MODEL, prompt, { temperature: 0.1, maxTokens: 400 });
  return parseJSON(raw);
};

/**
 * Root Cause Analysis on build/deploy logs + K8s events + metrics.
 *
 * @param {{ logs, events, metricsSummary }} input
 * @returns {{ rootCause, confidence, suggestedAction, affectedComponent, severity }}
 */
const analyzeRootCause = async ({ logs, events, metricsSummary }) => {
  const prompt = `
You are an expert DevOps root-cause analysis assistant. Analyze the failure data below
and identify the most likely root cause.

Respond ONLY with a single JSON object — no markdown, no explanation:
{
  "rootCause": "<concise technical description>",
  "confidence": <0.0 to 1.0>,
  "suggestedAction": "restart|rollback|scale_up|scale_down|alert_only",
  "affectedComponent": "<service name, pod name, or infra layer>",
  "severity": "low|medium|high|critical"
}

=== Build / Deploy Logs ===
${logs || 'No logs provided.'}

=== Kubernetes Events ===
${events || 'No events provided.'}

=== Metrics Summary ===
${metricsSummary || 'No metrics provided.'}
`.trim();

  const raw = await callOllama(RCA_MODEL, prompt, { temperature: 0.1, maxTokens: 600 });
  return parseJSON(raw);
};

/**
 * Explain a recovery decision in plain English for a non-technical stakeholder.
 *
 * @param {{ rootCause, actionType, businessImpact, serviceNam }} input
 * @returns {string}
 */
const explainRecoveryDecision = async ({ rootCause, actionType, businessImpact, serviceName }) => {
  const prompt = `
You are writing a short summary for a business dashboard. Explain in exactly 3 sentences why
the automated recovery action was taken.

- Service: ${serviceName || 'unknown'}
- Root cause detected: ${rootCause}
- Recovery action executed: ${actionType}
- Business impact: ${businessImpact || 'unspecified'}

Write in plain English. Avoid jargon. Do NOT use bullet points or headers.
`.trim();

  return callOllama(EXPLAIN_MODEL, prompt, { temperature: 0.4, maxTokens: 250 });
};

/**
 * Predict whether a metric will breach its SLO threshold based on recent trend.
 *
 * @param {{ metricName, threshold, comparator, recentValues: number[] }} input
 * @returns {{ willBreach, estimatedMinutesToBreach, trendDescription, confidence }}
 */
const predictFailure = async ({ metricName, threshold, comparator, recentValues }) => {
  const prompt = `
You are a monitoring AI. Analyze the recent metric trend below and predict whether
the metric will breach its SLO threshold.

Metric: ${metricName}
SLO threshold: value ${comparator} ${threshold}
Recent values (oldest → newest, sampled every 15s): [${recentValues.join(', ')}]

Respond ONLY with a single JSON object — no markdown, no explanation:
{
  "willBreach": true|false,
  "estimatedMinutesToBreach": <number or null if no breach expected>,
  "trendDescription": "<one sentence describing the trend>",
  "confidence": <0.0 to 1.0>
}
`.trim();

  const raw = await callOllama(PREDICT_MODEL, prompt, { temperature: 0.1, maxTokens: 300 });
  return parseJSON(raw);
};

/**
 * Health check — verify Ollama is reachable and at least one model is loaded.
 * @returns {{ ok: boolean, models: string[] }}
 */
const checkOllamaHealth = async () => {
  try {
    const res = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
    const models = (res.data?.models || []).map((m) => m.name);
    return { ok: true, models };
  } catch {
    return { ok: false, models: [] };
  }
};

module.exports = {
  requirementToSLO,
  analyzeRootCause,
  explainRecoveryDecision,
  predictFailure,
  checkOllamaHealth,
};

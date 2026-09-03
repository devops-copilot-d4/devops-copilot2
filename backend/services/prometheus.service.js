const axios  = require('axios');
const logger = require('../config/logger');

const PROM_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

const queryInstant = async (promQLExpression) => {
  const response = await axios.get(`${PROM_URL}/api/v1/query`, {
    params: { query: promQLExpression },
    timeout: 10_000,
  });
  return response.data?.data?.result || [];
};

const queryRange = async (promQLExpression, start, end, step = '15s') => {
  const response = await axios.get(`${PROM_URL}/api/v1/query_range`, {
    params: { query: promQLExpression, start, end, step },
    timeout: 15_000,
  });
  return response.data?.data?.result || [];
};

const checkSLO = async ({ queryExpression, threshold, comparator }) => {
  try {
    const result = await queryInstant(queryExpression);
    if (!result.length) return { status: 'unknown', value: null };

    const value = parseFloat(result[0].value[1]);
    let met;
    switch (comparator) {
      case '<':  met = value < threshold;  break;
      case '<=': met = value <= threshold; break;
      case '>':  met = value > threshold;  break;
      case '>=': met = value >= threshold; break;
      case '==': met = value === threshold; break;
      default:   met = false;
    }

    return { status: met ? 'met' : 'violated', value };
  } catch (err) {
    logger.warn(`[prometheus] checkSLO failed: ${err.message}`);
    return { status: 'unknown', value: null };
  }
};

module.exports = { queryInstant, queryRange, checkSLO };

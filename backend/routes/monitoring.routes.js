const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const {
  queryMetric, queryMetricRange,
  getSLOs, checkSLONow, predictSLOBreach,
  getSystemHealth,
} = require('../controllers/monitoring.controller');

router.get('/health',                protect, getSystemHealth);
router.get('/metrics',               protect, queryMetric);
router.get('/metrics/range',         protect, queryMetricRange);
router.get('/slos',                  protect, getSLOs);
router.post('/slos/:id/check',       protect, checkSLONow);
router.get('/slos/:sloId/predict',   protect, predictSLOBreach);

module.exports = router;

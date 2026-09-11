const router = require('express').Router();
const { protect, noViewer } = require('../middleware/auth.middleware');
const { runRootCauseAnalysis, generateSLO, getIncidents, getIncidentById, getAIHealth } = require('../controllers/ai.controller');

router.get('/health',          getAIHealth);
router.get('/incidents',       protect,            getIncidents);
router.get('/incidents/:id',   protect,            getIncidentById);
router.post('/rca',            protect, noViewer,  runRootCauseAnalysis);
router.post('/slo/generate',   protect, noViewer,  generateSLO);

module.exports = router;

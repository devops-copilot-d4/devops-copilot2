const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { runRootCauseAnalysis, generateSLO, getIncidents, getIncidentById, getAIHealth } = require('../controllers/ai.controller');

router.get('/health',          getAIHealth);
router.get('/incidents',       protect, getIncidents);
router.get('/incidents/:id',   protect, getIncidentById);
router.post('/rca',            protect, runRootCauseAnalysis);
router.post('/slo/generate',   protect, generateSLO);

module.exports = router;

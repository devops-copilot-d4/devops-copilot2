const router = require('express').Router();
const { protect, noViewer } = require('../middleware/auth.middleware');
const { triggerDeployment, getDeployments, getDeploymentStatus, ingestLogs } = require('../controllers/deployment.controller');

router.get('/',        protect,            getDeployments);
router.post('/',       protect, noViewer,  triggerDeployment);
router.get('/:id',     protect,            getDeploymentStatus);
router.post('/:id/logs', protect, noViewer, ingestLogs);

module.exports = router;

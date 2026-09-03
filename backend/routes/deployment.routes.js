const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { triggerDeployment, getDeployments, getDeploymentStatus } = require('../controllers/deployment.controller');

router.get('/',       protect, getDeployments);
router.post('/',      protect, triggerDeployment);
router.get('/:id',    protect, getDeploymentStatus);

module.exports = router;

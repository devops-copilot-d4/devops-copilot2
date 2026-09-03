const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth.middleware');
const { createRecoveryAction, approveRecoveryAction, getRecoveryActions } = require('../controllers/recovery.controller');

router.get('/',           protect, getRecoveryActions);
router.post('/',          protect, createRecoveryAction);
router.patch('/:id/approve', protect, adminOnly, approveRecoveryAction);

module.exports = router;

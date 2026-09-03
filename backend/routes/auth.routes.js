const router   = require('express').Router();
const passport = require('passport');
const { protect } = require('../middleware/auth.middleware');
const { register, login, githubCallback, getMe } = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/login',    login);
router.get('/me',        protect, getMe);

// GitHub OAuth
router.get('/github',
  passport.authenticate('github', { scope: ['user:email', 'repo', 'workflow'] })
);
router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login' }),
  githubCallback
);

module.exports = router;

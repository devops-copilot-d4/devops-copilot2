require('dotenv').config();

const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const passport     = require('passport');

const connectDB        = require('./config/db');
const logger           = require('./config/logger');
const { initSocket }   = require('./services/socket.service');
const errorHandler     = require('./middleware/errorHandler.middleware');

// ── Passport GitHub strategy ──────────────────────────────────────────────────
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('./models/User');

passport.use(new GitHubStrategy(
  {
    clientID:     process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL:  process.env.GITHUB_CALLBACK_URL,
  },
  async (accessToken, _refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ githubId: profile.id });
      if (!user) {
        user = await User.create({
          githubId:    profile.id,
          username:    profile.username,
          email:       profile.emails?.[0]?.value || `${profile.username}@github.local`,
          avatar:      profile.photos?.[0]?.value,
          accessToken,
        });
      } else {
        user.accessToken = accessToken;
        await user.save({ validateBeforeSave: false });
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  }
));

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth.routes');
const serviceRoutes     = require('./routes/service.routes');
const requirementRoutes = require('./routes/requirement.routes');
const deploymentRoutes  = require('./routes/deployment.routes');
const monitoringRoutes  = require('./routes/monitoring.routes');
const aiRoutes          = require('./routes/ai.routes');
const recoveryRoutes    = require('./routes/recovery.routes');

// ── App ───────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

connectDB();
initSocket(server);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json({ limit: '5mb' }));   // deployments can have large log payloads
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));
app.use(passport.initialize());

// Rate limiting — protect AI endpoints (LLM calls are expensive)
const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true });
const llmLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'LLM rate limit exceeded' });
app.use('/api/', apiLimiter);
app.use('/api/ai/', llmLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date() })
);

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/services',     serviceRoutes);
app.use('/api/requirements', requirementRoutes);
app.use('/api/deployments',  deploymentRoutes);
app.use('/api/monitoring',   monitoringRoutes);
app.use('/api/ai',           aiRoutes);
app.use('/api/recovery',     recoveryRoutes);

// ── 404 + error ───────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.originalUrl}` }));
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`));

module.exports = app;

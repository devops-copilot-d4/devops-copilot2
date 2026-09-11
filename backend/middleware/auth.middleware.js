const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const logger = require('../config/logger');

/**
 * Protect routes — verifies JWT from Authorization header (Bearer token).
 * Attaches the full user document to req.user.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });

    req.user = user;
    next();
  } catch (err) {
    logger.warn(`Auth failed: ${err.message}`);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Restrict to admin role only.
 */
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

/**
 * Restrict to one or more roles.
 * Usage: authorize('admin', 'developer')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Access denied — requires one of: ${roles.join(', ')}`,
    });
  }
  next();
};

/**
 * Viewer guard — blocks viewer role from write operations.
 * Attach after protect on any mutating route.
 */
const noViewer = (req, res, next) => {
  if (req.user?.role === 'viewer') {
    return res.status(403).json({ message: 'Viewers cannot perform write operations' });
  }
  next();
};

module.exports = { protect, adminOnly, authorize, noViewer };

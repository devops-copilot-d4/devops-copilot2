const logger = require('../config/logger');

// Central error handler — always register last in Express
const errorHandler = (err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} → ${err.message}`, { stack: err.stack });

  const statusCode = err.statusCode || res.statusCode === 200 ? 500 : res.statusCode;

  res.status(statusCode).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;

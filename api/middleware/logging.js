// logging.js - Request Logging Middleware with Request IDs
const { logRequest } = require('../utils/logger');
const crypto = require('crypto');

/**
 * Generate unique request ID for tracing
 */
function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Request logging middleware
 * - Adds unique request ID to each request
 * - Logs request/response with duration
 * - Makes request ID available for error tracing
 *
 * Usage:
 *   app.use(requestLoggingMiddleware);
 */
function requestLoggingMiddleware(req, res, next) {
  // Generate and attach request ID
  req.id = generateRequestId();

  // Attach request ID to response headers (useful for debugging)
  res.setHeader('X-Request-ID', req.id);

  // Capture start time
  const startTime = Date.now();

  // Intercept res.json to log after response is sent
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    const duration = Date.now() - startTime;
    logRequest(req, res, duration);
    return originalJson(data);
  };

  // Also handle res.send
  const originalSend = res.send.bind(res);
  res.send = function(data) {
    const duration = Date.now() - startTime;
    logRequest(req, res, duration);
    return originalSend(data);
  };

  next();
}

module.exports = { requestLoggingMiddleware, generateRequestId };

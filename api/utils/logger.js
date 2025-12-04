// logger.js - Structured Logging Utility
// Replaces console.log with structured JSON logging for production

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Core logging function - outputs structured JSON logs
 *
 * @param {string} level - Log level (ERROR, WARN, INFO, DEBUG)
 * @param {string} message - Human-readable message
 * @param {Object} metadata - Additional context (request ID, user ID, etc.)
 */
function log(level, message, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };

  // In production, always log as JSON
  // In development, make it readable
  if (isProduction) {
    console.log(JSON.stringify(logEntry));
  } else {
    // Pretty print for development
    const emoji = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'INFO' ? 'ℹ️' : '🐛';
    console.log(`${emoji} [${level}] ${message}`, metadata);
  }
}

/**
 * Log error with stack trace
 */
function error(message, errorObj = null, metadata = {}) {
  const errorData = errorObj ? {
    error: errorObj.message,
    stack: errorObj.stack,
    ...metadata
  } : metadata;

  log(LOG_LEVELS.ERROR, message, errorData);
}

/**
 * Log warning
 */
function warn(message, metadata = {}) {
  log(LOG_LEVELS.WARN, message, metadata);
}

/**
 * Log info (disabled in production by default for performance)
 */
function info(message, metadata = {}) {
  if (!isProduction || process.env.LOG_LEVEL === 'INFO') {
    log(LOG_LEVELS.INFO, message, metadata);
  }
}

/**
 * Log debug (development only)
 */
function debug(message, metadata = {}) {
  if (!isProduction) {
    log(LOG_LEVELS.DEBUG, message, metadata);
  }
}

/**
 * Log HTTP request
 */
function logRequest(req, res, duration) {
  const metadata = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    query: req.query,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('user-agent')
  };

  if (res.statusCode >= 500) {
    error(`Request failed: ${req.method} ${req.path}`, null, metadata);
  } else if (res.statusCode >= 400) {
    warn(`Client error: ${req.method} ${req.path}`, metadata);
  } else {
    info(`Request: ${req.method} ${req.path}`, metadata);
  }
}

module.exports = {
  error,
  warn,
  info,
  debug,
  logRequest
};

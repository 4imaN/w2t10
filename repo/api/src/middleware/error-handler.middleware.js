const { AppError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const crypto = require('crypto');

const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'api_key', 'authorization',
  'cookie', 'credit_card', 'ssn', 'phone', 'x-api-key', 'x-device-secret'];

function sanitizeForLog(err) {
  const safe = {
    message: err.message || 'Unknown error',
    code: err.code || 'INTERNAL_ERROR',
    correlation_id: crypto.randomUUID()
  };

  if (process.env.NODE_ENV !== 'production') {
    safe.stack = err.stack;
  }

  return safe;
}

function errorHandler(err, req, res, _next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(422).json({
      code: 'FILE_TOO_LARGE',
      message: 'File exceeds maximum allowed size of 10 MB'
    });
  }

  if (err.message && err.message.includes('Only JPG and PNG')) {
    return res.status(422).json({
      code: 'INVALID_FILE_TYPE',
      message: err.message
    });
  }

  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(422).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      code: 'DUPLICATE',
      message: `Duplicate value for ${field}`
    });
  }

  if (err instanceof AppError) {
    const response = {
      code: err.code,
      message: err.message
    };
    if (err.details) response.details = err.details;
    return res.status(err.statusCode).json(response);
  }

  const safeLog = sanitizeForLog(err);
  logger.error('Unhandled error', safeLog);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    correlation_id: safeLog.correlation_id
  });
}

module.exports = { errorHandler, sanitizeForLog, SENSITIVE_FIELDS };

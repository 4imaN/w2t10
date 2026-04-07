const SENSITIVE_KEYS = ['password', 'token', 'secret', 'api_key', 'authorization',
  'cookie', 'credit_card', 'ssn', 'x-api-key', 'x-device-secret'];

function redactSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

function formatEntry(level, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redactSensitive(meta)
  });
}

const logger = {
  info(message, meta) {
    console.log(formatEntry('info', message, meta));
  },
  warn(message, meta) {
    console.warn(formatEntry('warn', message, meta));
  },
  error(message, meta) {
    console.error(formatEntry('error', message, meta));
  }
};

function requestLogger() {
  return function (req, res, next) {
    const start = Date.now();
    const originalEnd = res.end;

    res.end = function (...args) {
      const duration = Date.now() - start;
      logger.info('request', {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration_ms: duration,
        request_id: req.headers['x-request-id'] || null
      });
      originalEnd.apply(res, args);
    };

    next();
  };
}

module.exports = { logger, requestLogger, formatEntry, redactSensitive, SENSITIVE_KEYS };

const { formatEntry, redactSensitive, SENSITIVE_KEYS, requestLogger } = require('../api/src/utils/logger');

describe('Structured Logger', () => {
  test('formatEntry produces valid JSON with required fields', () => {
    const raw = formatEntry('info', 'test message', { foo: 'bar' });
    const parsed = JSON.parse(raw);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
    expect(parsed.foo).toBe('bar');
    expect(parsed.timestamp).toBeDefined();
  });

  test('formatEntry includes ISO timestamp', () => {
    const raw = formatEntry('warn', 'check');
    const parsed = JSON.parse(raw);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('redactSensitive strips password field', () => {
    const result = redactSensitive({ username: 'admin', password: 'secret123' });
    expect(result.username).toBe('admin');
    expect(result.password).toBe('[REDACTED]');
  });

  test('redactSensitive strips token and api_key', () => {
    const result = redactSensitive({ token: 'jwt-value', api_key: 'key-value', status: 200 });
    expect(result.token).toBe('[REDACTED]');
    expect(result.api_key).toBe('[REDACTED]');
    expect(result.status).toBe(200);
  });

  test('redactSensitive handles null/undefined gracefully', () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  test('SENSITIVE_KEYS list covers critical fields', () => {
    const required = ['password', 'token', 'secret', 'api_key', 'authorization'];
    for (const key of required) {
      expect(SENSITIVE_KEYS).toContain(key);
    }
  });

  test('formatEntry redacts sensitive meta fields', () => {
    const raw = formatEntry('error', 'login failed', {
      username: 'admin',
      password: 'leaked',
      token: 'jwt-leaked'
    });
    const parsed = JSON.parse(raw);
    expect(parsed.username).toBe('admin');
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.token).toBe('[REDACTED]');
  });
});

describe('requestLogger middleware', () => {
  test('returns a function (middleware)', () => {
    const mw = requestLogger();
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3);
  });

  test('logs method, path, status, and duration_ms on response end', (done) => {
    const { logger } = require('../api/src/utils/logger');
    const origInfo = logger.info;
    let captured;
    logger.info = (msg, meta) => { captured = { msg, meta }; };

    const mw = requestLogger();
    const req = { method: 'GET', originalUrl: '/api/health', headers: {} };
    const res = {
      statusCode: 200,
      end: function () {
        expect(captured).toBeDefined();
        expect(captured.msg).toBe('request');
        expect(captured.meta.method).toBe('GET');
        expect(captured.meta.path).toBe('/api/health');
        expect(captured.meta.status).toBe(200);
        expect(typeof captured.meta.duration_ms).toBe('number');
        logger.info = origInfo;
        done();
      }
    };
    mw(req, res, () => {});
    res.end();
  });

  test('does not log sensitive headers', (done) => {
    const { logger } = require('../api/src/utils/logger');
    const origInfo = logger.info;
    let captured;
    logger.info = (msg, meta) => { captured = { msg, meta }; };

    const mw = requestLogger();
    const req = {
      method: 'POST', originalUrl: '/api/auth/login',
      headers: { authorization: 'Bearer secret-jwt', 'x-device-secret': 'dev-secret' }
    };
    const res = {
      statusCode: 200,
      end: function () {
        expect(captured.meta.authorization).toBeUndefined();
        expect(captured.meta['x-device-secret']).toBeUndefined();
        logger.info = origInfo;
        done();
      }
    };
    mw(req, res, () => {});
    res.end();
  });
});

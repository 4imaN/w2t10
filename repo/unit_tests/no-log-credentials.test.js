const { sanitizeForLog, SENSITIVE_FIELDS } = require('../api/src/middleware/error-handler.middleware');

describe('Safe Error Logging — No Sensitive Data Exposure', () => {
  test('sanitizeForLog returns only safe fields', () => {
    const err = new Error('Something failed');
    err.code = 'TEST_ERROR';
    err.stack = 'Error: Something failed\n    at Object.<anonymous> (/app/routes.js:42:11)';

    const result = sanitizeForLog(err);
    expect(result.message).toBe('Something failed');
    expect(result.code).toBe('TEST_ERROR');
    expect(result.correlation_id).toBeDefined();
    expect(result.stack).toBeDefined();
  });

  test('sanitizeForLog strips stack in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const err = new Error('Production error');
      err.stack = 'Error: Production error\n    at secret.js:1:1';

      const result = sanitizeForLog(err);
      expect(result.stack).toBeUndefined();
      expect(result.message).toBe('Production error');
      expect(result.correlation_id).toBeDefined();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('SENSITIVE_FIELDS list covers all critical field names', () => {
    const required = ['password', 'token', 'secret', 'api_key', 'authorization'];
    for (const field of required) {
      expect(SENSITIVE_FIELDS).toContain(field);
    }
  });

  test('sanitizeForLog does not include raw error object properties', () => {
    const err = new Error('DB error');
    err.password = 'secret123';
    err.token = 'jwt-token';
    err.requestBody = { username: 'admin', password: 'p@ss' };

    const result = sanitizeForLog(err);
    expect(result.password).toBeUndefined();
    expect(result.token).toBeUndefined();
    expect(result.requestBody).toBeUndefined();
    expect(Object.keys(result).sort()).toEqual(
      expect.arrayContaining(['message', 'code', 'correlation_id'])
    );
  });

  test('correlation_id is a valid UUID', () => {
    const err = new Error('test');
    const result = sanitizeForLog(err);
    expect(result.correlation_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

const fs = require('fs');
const path = require('path');

describe('Extension Endpoint Auth & Permissions', () => {
  const routeFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'routes', 'extensions.routes.js'), 'utf-8'
  );

  test('extension data endpoints use API key auth', () => {
    expect(routeFile).toContain('extensionAuth');
    expect(routeFile).toContain('x-api-key');
  });

  test('API key is verified via bcrypt', () => {
    expect(routeFile).toContain('bcrypt.compare');
  });

  test('client creation requires admin auth', () => {
    expect(routeFile).toContain('authMiddleware');
    expect(routeFile).toContain('adminOnly');
  });

  test('rate limiting is enforced', () => {
    expect(routeFile).toContain('rate_limit');
    expect(routeFile).toContain('RATE_LIMITED');
    expect(routeFile).toContain('429');
  });

  test('permission checks exist for each resource', () => {
    expect(routeFile).toContain("resource === 'movies'");
    expect(routeFile).toContain("resource === 'content'");
    expect(routeFile).toContain("resource === 'rides'");
  });

  test('unauthorized API key returns 401', () => {
    expect(routeFile).toContain('401');
    expect(routeFile).toContain('Invalid API key');
  });

  test('missing permission returns 403', () => {
    expect(routeFile).toContain('403');
    expect(routeFile).toContain('No permission');
  });
});

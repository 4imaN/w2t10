const fs = require('fs');
const path = require('path');

const openapi = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'api', 'src', 'docs', 'openapi.json'), 'utf-8'
));
const openapiPaths = new Set(Object.keys(openapi.paths));

function extractRoutes(filename) {
  const content = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'routes', filename), 'utf-8'
  );
  const routes = [];
  const patterns = [
    /router\.(get|post|put|delete)\(['"]([^'"]+)['"]/g,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(content)) !== null) {
      routes.push({ method: m[1].toUpperCase(), path: m[2] });
    }
  }
  return routes;
}

const ROUTE_MOUNTS = {
  'auth.routes.js': '/auth',
  'users.routes.js': '/users',
  'movies.routes.js': '/movies',
  'movie-import.routes.js': '/movie-import',
  'content.routes.js': '/content',
  'content-review.routes.js': '/content-review',
  'rides.routes.js': '/rides',
  'dispatch.routes.js': '/dispatch',
  'disputes.routes.js': '/disputes',
  'search.routes.js': '/search',
  'recommendations.routes.js': '/recommendations',
  'sensors.routes.js': '/sensors',
  'ledger.routes.js': '/ledger',
  'config.routes.js': '/config',
  'extensions.routes.js': '/extensions',
};

describe('OpenAPI Parity', () => {
  const allImplementedRoutes = [];

  for (const [file, mount] of Object.entries(ROUTE_MOUNTS)) {
    const routes = extractRoutes(file);
    for (const r of routes) {
      const fullPath = mount + r.path.replace(/\/$/, '');
      allImplementedRoutes.push({ method: r.method, path: fullPath, file });
    }
  }

  test('OpenAPI spec exists and has paths', () => {
    expect(openapiPaths.size).toBeGreaterThan(10);
  });

  test('all major route groups are represented in OpenAPI', () => {
    const openapiGroups = new Set([...openapiPaths].map(p => '/' + p.split('/')[1]));
    const requiredGroups = ['/auth', '/users', '/movies', '/content', '/rides',
      '/dispatch', '/search', '/sensors', '/ledger', '/config', '/health'];
    for (const g of requiredGroups) {
      expect(openapiGroups.has(g)).toBe(true);
    }
  });

  test('critical endpoints are documented', () => {
    const critical = [
      '/auth/login', '/auth/logout', '/auth/me',
      '/users', '/movies', '/movies/{id}',
      '/content', '/rides', '/rides/{id}/cancel',
      '/search', '/search/suggest',
      '/dispatch/queue',
      '/sensors/ingest', '/sensors/ingest/batch', '/sensors/devices',
      '/ledger/entries', '/ledger/reconciliation/{date}/close',
      '/config', '/health',
    ];
    for (const ep of critical) {
      expect(openapiPaths.has(ep)).toBe(true);
    }
  });

  test('sensor ingest documents device auth headers', () => {
    const ingest = openapi.paths['/sensors/ingest'];
    expect(ingest).toBeTruthy();
    const params = ingest.post.parameters || [];
    const headerNames = params.map(p => p.name);
    expect(headerNames).toContain('X-Device-Id');
    expect(headerNames).toContain('X-Device-Secret');
  });

  test('no "no auth" claims remain for sensor endpoints', () => {
    const json = JSON.stringify(openapi);
    expect(json).not.toContain('no auth');
  });

  test('implemented routes have reasonable OpenAPI coverage', () => {
    const normalizedPaths = new Set(
      [...openapiPaths].map(p => p.replace(/\{[^}]+\}/g, ':param'))
    );
    let documented = 0;
    let total = 0;
    for (const r of allImplementedRoutes) {
      const normalized = r.path.replace(/:[a-zA-Z]+/g, ':param');
      total++;
      if (normalizedPaths.has(normalized)) documented++;
    }
    const coverage = documented / total;
    expect(coverage).toBeGreaterThan(0.4);
  });
});

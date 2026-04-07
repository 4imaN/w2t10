const openapi = require('../api/src/docs/openapi.json');
const manifest = require('../api/src/routes/manifest');

function normalizeParam(p) {
  return p.replace(/:[a-zA-Z]+/g, ':param').replace(/\{[^}]+\}/g, ':param');
}

const openapiRouteMethodPairs = new Set();
for (const [oaPath, methods] of Object.entries(openapi.paths)) {
  for (const method of Object.keys(methods)) {
    const httpMethod = method.toUpperCase();
    if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(httpMethod)) {
      openapiRouteMethodPairs.add(`${httpMethod} ${normalizeParam(oaPath)}`);
    }
  }
}

describe('OpenAPI Parity — Strict 100% Coverage', () => {
  test('OpenAPI spec exists and has paths', () => {
    expect(Object.keys(openapi.paths).length).toBeGreaterThan(10);
  });

  test('route manifest has a reasonable number of routes', () => {
    expect(manifest.length).toBeGreaterThan(30);
  });

  test('every implemented route+method is documented in OpenAPI', () => {
    const undocumented = [];
    for (const r of manifest) {
      const normalized = normalizeParam(r.path);
      const key = `${r.method} ${normalized}`;
      if (!openapiRouteMethodPairs.has(key)) {
        undocumented.push(`${r.method} ${r.path}`);
      }
    }
    if (undocumented.length > 0) {
      fail(
        `OpenAPI spec is missing ${undocumented.length} route(s):\n` +
        undocumented.map(u => `  - ${u}`).join('\n')
      );
    }
  });

  test('100% route+method parity', () => {
    let documented = 0;
    for (const r of manifest) {
      const normalized = normalizeParam(r.path);
      const key = `${r.method} ${normalized}`;
      if (openapiRouteMethodPairs.has(key)) documented++;
    }
    expect(documented / manifest.length).toBe(1);
  });

  test('sensor ingest documents device auth headers', () => {
    const ingest = openapi.paths['/sensors/ingest'];
    expect(ingest).toBeTruthy();
    const params = ingest.post.parameters || [];
    const headerNames = params.map(p => p.name);
    expect(headerNames).toContain('X-Device-Id');
    expect(headerNames).toContain('X-Device-Secret');
  });

  test('all major route groups are represented in OpenAPI', () => {
    const openapiPaths = Object.keys(openapi.paths);
    const openapiGroups = new Set(openapiPaths.map(p => '/' + p.split('/')[1]));
    const requiredGroups = ['/auth', '/users', '/movies', '/content', '/rides',
      '/dispatch', '/search', '/sensors', '/ledger', '/config', '/health'];
    for (const g of requiredGroups) {
      expect(openapiGroups.has(g)).toBe(true);
    }
  });
});

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf-8');

describe('Documentation Accuracy', () => {
  const readme = read('README.md');
  const apiSpec = read('docs/api-spec.md');
  const openapi = read('api/src/docs/openapi.json');
  const setupSh = read('setup.sh');
  const seedJs = read('api/src/db/seed.js');

  describe('Bootstrap credential retrieval', () => {
    test('README documents file-based retrieval', () => {
      expect(readme).toContain('.bootstrap-credentials');
      expect(readme).not.toContain('grep -A 10 BOOTSTRAP');
    });

    test('setup.sh documents file-based retrieval', () => {
      expect(setupSh).toContain('.bootstrap-credentials');
      expect(setupSh).not.toContain('grep -A 10 BOOTSTRAP');
    });

    test('seed.js writes to file, not logs', () => {
      expect(seedJs).toContain('.bootstrap-credentials');
      expect(seedJs).toContain('writeFileSync');
    });
  });

  describe('OpenAPI endpoint docs', () => {
    test('README points to /api/docs for Swagger UI', () => {
      expect(readme).toContain('Swagger UI');
      expect(readme).toContain('/api/docs');
    });

    test('README points to /api/docs.json for raw JSON', () => {
      expect(readme).toContain('/api/docs.json');
    });

    test('api-spec.md points to /api/docs.json for JSON', () => {
      expect(apiSpec).toContain('/api/docs.json');
    });
  });

  describe('Sensor ingest auth documentation', () => {
    test('api-spec.md documents device auth headers', () => {
      expect(apiSpec).toContain('X-Device-Id');
      expect(apiSpec).toContain('X-Device-Secret');
      expect(apiSpec).not.toMatch(/ingest.*no auth/i);
    });

    test('openapi.json documents device auth headers', () => {
      expect(openapi).toContain('X-Device-Id');
      expect(openapi).toContain('X-Device-Secret');
      expect(openapi).not.toContain('no auth');
    });

    test('api-spec.md documents body/header identity enforcement', () => {
      expect(apiSpec).toContain('body');
      expect(apiSpec).toContain('match');
    });
  });

  describe('Port consistency', () => {
    test('README uses port 8080', () => {
      expect(readme).toContain('localhost:8080');
    });

    test('api-spec.md uses port 8080', () => {
      expect(apiSpec).toContain('localhost:8080');
    });
  });
});

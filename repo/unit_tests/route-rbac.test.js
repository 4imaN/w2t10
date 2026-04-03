const fs = require('fs');
const path = require('path');

describe('Route-Level RBAC Enforcement', () => {
  function readRoute(name) {
    return fs.readFileSync(
      path.join(__dirname, '..', 'api', 'src', 'routes', name), 'utf-8'
    );
  }

  test('user routes require admin', () => {
    const f = readRoute('users.routes.js');
    expect(f).toContain('adminOnly');
  });

  test('config routes require admin', () => {
    const f = readRoute('config.routes.js');
    expect(f).toContain('adminOnly');
  });

  test('dispatch routes require admin or dispatcher', () => {
    const f = readRoute('dispatch.routes.js');
    expect(f).toContain('dispatcherOrAdmin');
  });

  test('ledger routes require admin or dispatcher', () => {
    const f = readRoute('ledger.routes.js');
    expect(f).toContain('dispatcherOrAdmin');
  });

  test('movie CUD routes require staff', () => {
    const f = readRoute('movies.routes.js');
    expect(f).toContain('staffOnly');
  });

  test('content CUD routes require staff', () => {
    const f = readRoute('content.routes.js');
    expect(f).toContain('staffOnly');
  });

  test('content review requires reviewer role', () => {
    const f = readRoute('content-review.routes.js');
    expect(f).toContain('reviewerOnly');
  });

  test('movie import requires staff', () => {
    const f = readRoute('movie-import.routes.js');
    expect(f).toContain('staffOnly');
  });

  test('sensor admin endpoints require admin', () => {
    const f = readRoute('sensors.routes.js');
    expect(f).toContain('adminOnly');
  });

  test('sensor ingest requires device auth', () => {
    const f = readRoute('sensors.routes.js');
    expect(f).toContain('deviceAuth');
    expect(f).toContain('enforceDeviceIdentity');
  });

  test('all authenticated routes use authMiddleware', () => {
    const routes = ['users.routes.js', 'movies.routes.js', 'content.routes.js',
      'rides.routes.js', 'dispatch.routes.js', 'ledger.routes.js', 'config.routes.js'];
    for (const r of routes) {
      expect(readRoute(r)).toContain('authMiddleware');
    }
  });
});

describe('Object-Level Authorization', () => {
  test('ride routes enforce ownership for non-privileged roles', () => {
    const f = fs.readFileSync(
      path.join(__dirname, '..', 'api', 'src', 'routes', 'rides.routes.js'), 'utf-8'
    );
    expect(f).toContain('enforceRideOwnership');
    expect(f).toContain('PRIVILEGED_ROLES');
  });

  test('dispute service enforces ride ownership', () => {
    const f = fs.readFileSync(
      path.join(__dirname, '..', 'api', 'src', 'services', 'dispute.service.js'), 'utf-8'
    );
    expect(f).toContain('ride.requester.toString()');
    expect(f).toContain('PRIVILEGED_ROLES');
  });
});

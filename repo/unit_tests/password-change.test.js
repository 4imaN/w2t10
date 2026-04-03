const fs = require('fs');
const path = require('path');

describe('Password Change Validation', () => {
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'services', 'auth.service.js'), 'utf-8'
  );
  const routeFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'routes', 'auth.routes.js'), 'utf-8'
  );

  test('service validates minimum password length', () => {
    expect(serviceFile).toContain('newPassword.length < 8');
    expect(serviceFile).toContain('at least 8 characters');
  });

  test('service prevents reuse of same password', () => {
    expect(serviceFile).toContain('newPassword === currentPassword');
    expect(serviceFile).toContain('different from current');
  });

  test('service clears must_change_password flag on success', () => {
    expect(serviceFile).toContain('must_change_password = false');
  });

  test('route validates required fields', () => {
    expect(routeFile).toContain('current_password');
    expect(routeFile).toContain('new_password');
    expect(routeFile).toContain('422');
  });

  test('login response includes must_change_password flag', () => {
    expect(serviceFile).toContain('must_change_password');
    expect(serviceFile).toContain('user.must_change_password');
  });
});

describe('Bootstrap Credential Security', () => {
  const seedFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'db', 'seed.js'), 'utf-8'
  );

  test('seed generates random passwords, not hardcoded', () => {
    expect(seedFile).toContain('generatePassword()');
    expect(seedFile).toContain('crypto.randomBytes');
    // Should NOT contain any hardcoded passwords
    expect(seedFile).not.toContain('Admin123!');
    expect(seedFile).not.toContain('Editor123!');
    expect(seedFile).not.toContain('User1234!');
  });

  test('seed sets must_change_password on all bootstrap accounts', () => {
    expect(seedFile).toContain('must_change_password: true');
  });

  test('seed writes credentials to file, not stdout', () => {
    expect(seedFile).toContain('.bootstrap-credentials');
    expect(seedFile).toContain('writeFileSync');
  });
});

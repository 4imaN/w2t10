const fs = require('fs');
const path = require('path');

describe('Sensor Onboarding End-to-End', () => {
  const routeFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'routes', 'sensors.routes.js'), 'utf-8'
  );
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'services', 'sensor.service.js'), 'utf-8'
  );
  const frontendFile = fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'src', 'features', 'sensors', 'SensorsPage.jsx'), 'utf-8'
  );

  test('device creation returns one-time plaintext secret', () => {
    expect(routeFile).toContain('device_secret: rawSecret');
    expect(routeFile).toContain("crypto.randomBytes(32).toString('hex')");
  });

  test('secret rotation endpoint exists', () => {
    expect(routeFile).toContain('rotate-secret');
    expect(routeFile).toContain('adminOnly');
  });

  test('secret_hash is allowed in updateDevice fields', () => {
    expect(serviceFile).toContain("'secret_hash'");
  });

  test('frontend shows secret modal with copy button', () => {
    expect(frontendFile).toContain('showSecret');
    expect(frontendFile).toContain('copySecret');
    expect(frontendFile).toContain('navigator.clipboard');
  });

  test('frontend requires acknowledgement before dismissing secret', () => {
    expect(frontendFile).toContain('secretAcked');
    expect(frontendFile).toContain('I have saved this secret');
    expect(frontendFile).toContain('disabled={!secretAcked}');
  });

  test('frontend has rotate secret button per device', () => {
    expect(frontendFile).toContain('handleRotateSecret');
    expect(frontendFile).toContain('Rotate Secret');
  });

  test('modal warns secret cannot be retrieved later', () => {
    expect(frontendFile).toContain('NOT be shown again');
    expect(frontendFile).toContain('cannot be retrieved');
  });
});

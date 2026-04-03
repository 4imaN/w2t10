const fs = require('fs');
const path = require('path');

describe('Sensor Dual Retention Design', () => {
  const modelFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'models', 'SensorReading.js'), 'utf-8'
  );
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'services', 'sensor.service.js'), 'utf-8'
  );

  test('unique index includes is_raw to allow raw+cleaned coexistence', () => {
    // The index must include is_raw so (device, timestamp, raw) and (device, timestamp, cleaned)
    // don't collide
    expect(modelFile).toContain('device_id: 1, timestamp: 1, is_raw: 1');
    expect(modelFile).toContain('unique: true');
  });

  test('service creates raw reading on every ingest', () => {
    expect(serviceFile).toContain('is_raw: true');
    expect(serviceFile).toContain('is_cleaned: false');
  });

  test('service creates separate cleaned copy for non-outlier readings', () => {
    // Should have a second SensorReading.create with is_raw: false, is_cleaned: true
    const cleanedCreateMatch = serviceFile.match(/is_raw:\s*false[\s\S]{0,100}is_cleaned:\s*true/);
    expect(cleanedCreateMatch).toBeTruthy();
  });

  test('dedup check only looks at raw readings', () => {
    expect(serviceFile).toContain("is_raw: true }");
  });
});

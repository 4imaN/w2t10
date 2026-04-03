const fs = require('fs');
const path = require('path');

describe('Sensor Time-Drift Enforcement', () => {
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'services', 'sensor.service.js'), 'utf-8'
  );
  const modelFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'models', 'SensorReading.js'), 'utf-8'
  );

  test('computes time drift in seconds', () => {
    expect(serviceFile).toContain('timeDriftSeconds');
    expect(serviceFile).toContain('Math.abs((timestamp - serverNow)');
  });

  test('reads drift threshold from config', () => {
    expect(serviceFile).toContain("getConfig('time_drift_threshold_seconds'");
    expect(serviceFile).toContain('300');
  });

  test('flags readings exceeding drift threshold', () => {
    expect(serviceFile).toContain('hasTimeDrift = timeDriftSeconds > driftThreshold');
    expect(serviceFile).toContain('time_drift: hasTimeDrift');
  });

  test('time drift flag prevents cleaned copy', () => {
    expect(serviceFile).toContain('outlierFlags.time_drift');
    expect(serviceFile).toContain('const hasOutlier = outlierFlags.range || outlierFlags.spike || outlierFlags.drift || outlierFlags.time_drift');
  });

  test('model includes time_drift in outlier_flags', () => {
    expect(modelFile).toContain('time_drift: { type: Boolean');
  });

  test('drift seconds are stored on reading', () => {
    expect(serviceFile).toContain('time_drift_seconds: timeDriftSeconds');
  });
});

describe('Time-Drift Logic (unit)', () => {
  const THRESHOLD = 300;

  function wouldFlag(readingTimestamp, serverNow) {
    const driftSec = Math.abs((new Date(readingTimestamp) - new Date(serverNow)) / 1000);
    return driftSec > THRESHOLD;
  }

  test('reading 1 second old is accepted', () => {
    const now = new Date();
    const reading = new Date(now.getTime() - 1000);
    expect(wouldFlag(reading, now)).toBe(false);
  });

  test('reading 4 minutes old is accepted', () => {
    const now = new Date();
    const reading = new Date(now.getTime() - 240000);
    expect(wouldFlag(reading, now)).toBe(false);
  });

  test('reading exactly 5 minutes old is accepted (boundary)', () => {
    const now = new Date();
    const reading = new Date(now.getTime() - 300000);
    expect(wouldFlag(reading, now)).toBe(false);
  });

  test('reading 6 minutes old is flagged', () => {
    const now = new Date();
    const reading = new Date(now.getTime() - 360000);
    expect(wouldFlag(reading, now)).toBe(true);
  });

  test('reading 1 hour in the future is flagged', () => {
    const now = new Date();
    const reading = new Date(now.getTime() + 3600000);
    expect(wouldFlag(reading, now)).toBe(true);
  });

  test('reading 10 seconds in the future is accepted', () => {
    const now = new Date();
    const reading = new Date(now.getTime() + 10000);
    expect(wouldFlag(reading, now)).toBe(false);
  });
});

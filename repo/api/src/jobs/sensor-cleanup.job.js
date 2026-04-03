const { cleanupExpiredReadings } = require('../services/sensor.service');

async function runSensorCleanup() {
  try {
    const count = await cleanupExpiredReadings();
    if (count > 0) {
      console.log(`[Sensor-Cleanup] Removed ${count} expired readings`);
    }
  } catch (err) {
    console.error('[Sensor-Cleanup] Error:', err.message);
  }
}

module.exports = { runSensorCleanup };

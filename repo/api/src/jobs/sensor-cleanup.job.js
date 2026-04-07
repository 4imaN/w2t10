const sensorService = require('../services/sensor.service');
const { logger } = require('../utils/logger');

async function runSensorCleanup() {
  try {
    const count = await sensorService.cleanupExpiredReadings();
    if (count > 0) {
      logger.info('sensor-cleanup completed', { job: 'sensor-cleanup', removed: count });
    }
  } catch (err) {
    logger.error('sensor-cleanup failed', { job: 'sensor-cleanup', error: err.message });
  }
}

module.exports = { runSensorCleanup };

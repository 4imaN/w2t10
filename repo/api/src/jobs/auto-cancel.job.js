const rideService = require('../services/ride.service');
const { logger } = require('../utils/logger');

async function runAutoCancel() {
  try {
    const count = await rideService.autoCancelExpiredRequests();
    if (count > 0) {
      logger.info('auto-cancel completed', { job: 'auto-cancel', canceled: count });
    }
  } catch (err) {
    logger.error('auto-cancel failed', { job: 'auto-cancel', error: err.message });
  }
}

module.exports = { runAutoCancel };

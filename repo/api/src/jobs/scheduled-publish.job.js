const contentService = require('../services/content.service');
const { logger } = require('../utils/logger');

async function runScheduledPublish() {
  try {
    const count = await contentService.publishScheduledContent();
    if (count > 0) {
      logger.info('scheduled-publish completed', { job: 'scheduled-publish', published: count });
    }
  } catch (err) {
    logger.error('scheduled-publish failed', { job: 'scheduled-publish', error: err.message });
  }
}

module.exports = { runScheduledPublish };

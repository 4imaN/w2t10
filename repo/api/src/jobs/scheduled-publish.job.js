const { publishScheduledContent } = require('../services/content.service');

async function runScheduledPublish() {
  try {
    const count = await publishScheduledContent();
    if (count > 0) {
      console.log(`[Scheduled-Publish] Published ${count} content items`);
    }
  } catch (err) {
    console.error('[Scheduled-Publish] Error:', err.message);
  }
}

module.exports = { runScheduledPublish };

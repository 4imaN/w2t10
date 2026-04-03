const { autoCancelExpiredRequests } = require('../services/ride.service');

async function runAutoCancel() {
  try {
    const count = await autoCancelExpiredRequests();
    if (count > 0) {
      console.log(`[Auto-Cancel] Canceled ${count} expired ride requests`);
    }
  } catch (err) {
    console.error('[Auto-Cancel] Error:', err.message);
  }
}

module.exports = { runAutoCancel };

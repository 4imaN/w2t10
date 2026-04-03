const { retryFailedEntries } = require('../services/ledger.service');

async function runLedgerRetry() {
  try {
    const count = await retryFailedEntries();
    if (count > 0) {
      console.log(`[Ledger-Retry] Retried ${count} failed entries`);
    }
  } catch (err) {
    console.error('[Ledger-Retry] Error:', err.message);
  }
}

module.exports = { runLedgerRetry };

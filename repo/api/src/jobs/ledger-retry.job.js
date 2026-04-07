const ledgerService = require('../services/ledger.service');
const { logger } = require('../utils/logger');

async function runLedgerRetry() {
  try {
    const count = await ledgerService.retryFailedEntries();
    if (count > 0) {
      logger.info('ledger-retry completed', { job: 'ledger-retry', retried: count });
    }
  } catch (err) {
    logger.error('ledger-retry failed', { job: 'ledger-retry', error: err.message });
  }
}

module.exports = { runLedgerRetry };

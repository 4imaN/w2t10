const searchService = require('../services/search.service');
const { logger } = require('../utils/logger');

async function runSuggestionsRefresh() {
  try {
    const count = await searchService.refreshSuggestions();
    logger.info('suggestions-refresh completed', { job: 'suggestions-refresh', refreshed: count });
  } catch (err) {
    logger.error('suggestions-refresh failed', { job: 'suggestions-refresh', error: err.message });
  }
}

module.exports = { runSuggestionsRefresh };

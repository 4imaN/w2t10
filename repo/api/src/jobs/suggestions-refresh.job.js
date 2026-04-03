const { refreshSuggestions } = require('../services/search.service');

async function runSuggestionsRefresh() {
  try {
    const count = await refreshSuggestions();
    console.log(`[Suggestions-Refresh] Refreshed ${count} search suggestions`);
  } catch (err) {
    console.error('[Suggestions-Refresh] Error:', err.message);
  }
}

module.exports = { runSuggestionsRefresh };

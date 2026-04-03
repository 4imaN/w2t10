const Fuse = require('fuse.js');

/**
 * Re-ranks an array of items using fuzzy matching.
 * @param {Array} items - Array of objects to search
 * @param {string} query - Search query
 * @param {Array<string>} keys - Object keys to search against
 * @param {Object} options - Additional Fuse.js options
 * @returns {Array} - Sorted results with scores
 */
function fuzzySearch(items, query, keys, options = {}) {
  if (!query || !items || items.length === 0) return items;

  const fuse = new Fuse(items, {
    keys,
    threshold: 0.4,       // 0 = exact, 1 = anything
    distance: 100,
    includeScore: true,
    minMatchCharLength: 2,
    ...options
  });

  const results = fuse.search(query);
  return results.map(r => ({
    ...r.item,
    _fuzzyScore: r.score
  }));
}

module.exports = { fuzzySearch };

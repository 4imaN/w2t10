const Movie = require('../models/Movie');
const ContentItem = require('../models/ContentItem');
const User = require('../models/User');
const SearchSuggestion = require('../models/SearchSuggestion');
const UserInteraction = require('../models/UserInteraction');
const { fuzzySearch } = require('../utils/fuzzy-search');
const { sanitizeUser } = require('./user.service');

const RATING_ORDER = { 'G': 1, 'PG': 2, 'PG-13': 3, 'R': 4, 'NC-17': 5, 'NR': 6 };

async function searchMovies(query, filters) {
  const baseQuery = { deleted_at: null, is_published: true };
  if (filters.mpaa_rating) baseQuery.mpaa_rating = filters.mpaa_rating;

  let movies = [];
  try {
    movies = await Movie.find({ ...baseQuery, $text: { $search: query } }, { score: { $meta: 'textScore' } })
      .select('-revisions').sort({ score: { $meta: 'textScore' } }).limit(50);
  } catch {
  }

  if (movies.length === 0) {
    const candidates = await Movie.find(baseQuery).select('-revisions').limit(200);
    movies = fuzzySearch(candidates.map(m => m.toObject()), query, ['title', 'description', 'tags']);
    return movies;
  }

  const fuzzyResults = fuzzySearch(movies.map(m => m.toObject()), query, ['title', 'description', 'tags']);
  return fuzzyResults.length > 0 ? fuzzyResults : movies.map(m => m.toObject());
}

async function searchContent(query, filters, userRole) {
  const baseQuery = { deleted_at: null };
  const editorialRoles = ['administrator', 'editor', 'reviewer'];
  if (!editorialRoles.includes(userRole)) baseQuery.status = 'published';
  if (filters.content_type) baseQuery.content_type = filters.content_type;

  let content = [];
  try {
    content = await ContentItem.find({ ...baseQuery, $text: { $search: query } }, { score: { $meta: 'textScore' } })
      .select('-revisions').populate('author', 'username display_name')
      .sort({ score: { $meta: 'textScore' } }).limit(50);
  } catch {}

  if (content.length === 0) {
    const candidates = await ContentItem.find(baseQuery).select('-revisions')
      .populate('author', 'username display_name').limit(200);
    return fuzzySearch(candidates.map(c => c.toObject()), query, ['title', 'body']);
  }

  const fuzzyResults = fuzzySearch(content.map(c => c.toObject()), query, ['title', 'body']);
  return fuzzyResults.length > 0 ? fuzzyResults : content.map(c => c.toObject());
}

async function unifiedSearch(query, filters = {}, page = 1, limit = 20, userRole = 'regular_user') {
  const results = { movies: [], content: [], users: [], total: 0 };
  if (!query || query.trim().length === 0) return results;

  const searchTypes = filters.type ? [filters.type] : ['movie', 'content', 'user'];

  if (searchTypes.includes('movie')) {
    results.movies = await searchMovies(query, filters);

    if (filters.sort === 'popularity') {
      results.movies.sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));
    } else if (filters.sort === 'newest') {
      results.movies.sort((a, b) => new Date(b.release_date || 0) - new Date(a.release_date || 0));
    } else if (filters.sort === 'rating') {
      results.movies.sort((a, b) => (RATING_ORDER[a.mpaa_rating] || 6) - (RATING_ORDER[b.mpaa_rating] || 6));
    }
  }

  if (searchTypes.includes('content')) {
    results.content = await searchContent(query, filters, userRole);
    if (filters.sort === 'newest') {
      results.content.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
  }

  if (searchTypes.includes('user') && ['administrator', 'dispatcher'].includes(userRole)) {
    const users = await User.find({
      deleted_at: null,
      $or: [
        { username: new RegExp(escapeRegex(query), 'i') },
        { display_name: new RegExp(escapeRegex(query), 'i') }
      ]
    }).select('-password_hash -__v').limit(20);

    let userResults = users.map(u => sanitizeUser(u));

    if (userResults.length === 0) {
      const allUsers = await User.find({ deleted_at: null }).select('-password_hash -__v').limit(100);
      userResults = fuzzySearch(
        allUsers.map(u => sanitizeUser(u)),
        query,
        ['username', 'display_name']
      );
    }
    results.users = userResults;
  }

  results.total = results.movies.length + results.content.length + results.users.length;
  results.sort_applied = {
    movies: ['popularity', 'newest', 'rating'].includes(filters.sort) ? filters.sort : 'relevance',
    content: filters.sort === 'newest' ? 'newest' : 'relevance',
    users: 'relevance'
  };
  return results;
}

async function getSuggestions(partial) {
  if (!partial || partial.length < 2) return [];

  const regex = new RegExp(`^${escapeRegex(partial)}`, 'i');

  let suggestions = await SearchSuggestion.find({ text: regex })
    .sort({ score: -1 }).limit(10);

  if (suggestions.length < 3) {
    const allSuggestions = await SearchSuggestion.find({}).sort({ score: -1 }).limit(200);
    const fuzzyMatches = fuzzySearch(
      allSuggestions.map(s => s.toObject()),
      partial,
      ['text'],
      { threshold: 0.5 }
    );
    const existingTexts = new Set(suggestions.map(s => s.text.toLowerCase()));
    for (const m of fuzzyMatches) {
      if (!existingTexts.has(m.text.toLowerCase())) {
        suggestions.push(m);
        existingTexts.add(m.text.toLowerCase());
      }
      if (suggestions.length >= 10) break;
    }
  }

  if (suggestions.length < 10) {
    const movies = await Movie.find({ title: regex, is_published: true, deleted_at: null })
      .select('title').limit(10 - suggestions.length);
    const existingTexts = new Set(suggestions.map(s => (s.text || '').toLowerCase()));
    for (const m of movies) {
      if (!existingTexts.has(m.title.toLowerCase())) {
        suggestions.push({ text: m.title, type: 'movie', entity_id: m._id, score: 0 });
      }
    }
  }

  return suggestions.slice(0, 10);
}

async function trackInteraction(userId, entityType, entityId, actionType, searchQuery = null) {
  await UserInteraction.create({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action_type: actionType,
    search_query: searchQuery,
    timestamp: new Date()
  });
}

async function refreshSuggestions() {
  await SearchSuggestion.deleteMany({});

  const movies = await Movie.find({ is_published: true, deleted_at: null })
    .sort({ popularity_score: -1 }).limit(100).select('title');

  const suggestions = movies.map((m, i) => ({
    text: m.title, type: 'movie', entity_id: m._id, score: 100 - i
  }));

  const content = await ContentItem.find({ status: 'published', deleted_at: null })
    .sort({ created_at: -1 }).limit(50).select('title');

  content.forEach((c, i) => {
    suggestions.push({ text: c.title, type: 'content', entity_id: c._id, score: 50 - i });
  });

  const recentSearches = await UserInteraction.aggregate([
    { $match: { action_type: 'search', search_query: { $ne: null } } },
    { $group: { _id: '$search_query', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 50 }
  ]);

  recentSearches.forEach((s) => {
    suggestions.push({ text: s._id, type: 'query', score: s.count });
  });

  if (suggestions.length > 0) {
    await SearchSuggestion.insertMany(suggestions);
  }
  return suggestions.length;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  unifiedSearch,
  getSuggestions,
  trackInteraction,
  refreshSuggestions
};

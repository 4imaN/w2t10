const Movie = require('../models/Movie');
const ContentItem = require('../models/ContentItem');
const UserInteraction = require('../models/UserInteraction');
const { getConfig } = require('./config.service');

async function getRecommendations(userId, limit = 20) {
  // Check user interaction history
  const interactions = await UserInteraction.find({
    user_id: userId,
    entity_type: 'movie',
    action_type: 'view'
  })
    .sort({ timestamp: -1 })
    .limit(50);

  if (interactions.length === 0) {
    // Cold start: trending movies + editor-curated tags
    return getColdStartRecommendations(limit);
  }

  // Get categories/tags from viewed movies
  const viewedMovieIds = [...new Set(interactions.map(i => i.entity_id).filter(Boolean))];
  const viewedMovies = await Movie.find({
    _id: { $in: viewedMovieIds },
    deleted_at: null
  }).select('categories tags');

  const categoryWeights = {};
  const tagWeights = {};

  for (const movie of viewedMovies) {
    for (const cat of movie.categories || []) {
      categoryWeights[cat] = (categoryWeights[cat] || 0) + 1;
    }
    for (const tag of movie.tags || []) {
      tagWeights[tag] = (tagWeights[tag] || 0) + 1;
    }
  }

  // Find movies with similar categories/tags, excluding already viewed
  const topCategories = Object.entries(categoryWeights).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  const topTags = Object.entries(tagWeights).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);

  const recommended = await Movie.find({
    _id: { $nin: viewedMovieIds },
    deleted_at: null,
    is_published: true,
    $or: [
      { categories: { $in: topCategories } },
      { tags: { $in: topTags } }
    ]
  })
    .select('-revisions')
    .sort({ popularity_score: -1 })
    .limit(limit);

  if (recommended.length < limit) {
    // Fill with trending
    const trending = await getTrendingMovies(limit - recommended.length, viewedMovieIds.concat(recommended.map(m => m._id)));
    return { movies: [...recommended, ...trending], source: 'personalized' };
  }

  return { movies: recommended, source: 'personalized' };
}

async function getColdStartRecommendations(limit = 20) {
  const featuredTags = await getConfig('featured_tags', ['staff-pick', 'new-release']);

  // Trending movies
  const trending = await getTrendingMovies(Math.ceil(limit / 2));

  // Editor-curated (featured tags)
  const curated = await Movie.find({
    tags: { $in: featuredTags },
    is_published: true,
    deleted_at: null,
    _id: { $nin: trending.map(m => m._id) }
  })
    .select('-revisions')
    .sort({ popularity_score: -1 })
    .limit(Math.floor(limit / 2));

  return {
    movies: [...trending, ...curated],
    source: 'cold_start'
  };
}

async function getTrendingMovies(limit = 10, excludeIds = []) {
  // Trending = most interactions in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const trending = await UserInteraction.aggregate([
    {
      $match: {
        entity_type: 'movie',
        timestamp: { $gte: sevenDaysAgo },
        entity_id: { $nin: excludeIds }
      }
    },
    { $group: { _id: '$entity_id', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);

  if (trending.length === 0) {
    // Fallback: newest movies
    return Movie.find({
      is_published: true,
      deleted_at: null,
      _id: { $nin: excludeIds }
    })
      .select('-revisions')
      .sort({ created_at: -1 })
      .limit(limit);
  }

  const movieIds = trending.map(t => t._id);
  const movies = await Movie.find({
    _id: { $in: movieIds },
    is_published: true,
    deleted_at: null
  }).select('-revisions');

  // Maintain trending order
  const movieMap = {};
  movies.forEach(m => { movieMap[m._id.toString()] = m; });
  return movieIds.map(id => movieMap[id?.toString()]).filter(Boolean);
}

async function getRecommendedContent(userId, limit = 10) {
  // Simple: recently published + popular
  const content = await ContentItem.find({
    status: 'published',
    deleted_at: null
  })
    .select('-revisions')
    .populate('author', 'username display_name')
    .sort({ created_at: -1 })
    .limit(limit);

  return content;
}

module.exports = {
  getRecommendations,
  getColdStartRecommendations,
  getTrendingMovies,
  getRecommendedContent
};

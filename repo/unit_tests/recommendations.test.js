const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let recService, Movie, UserInteraction, ConfigDictionary;

const personalizedUserId = new mongoose.Types.ObjectId();
const coldUserId = new mongoose.Types.ObjectId();
const trendingBoostUserId = new mongoose.Types.ObjectId();
let actionMovieViewed, actionMovieUnviewed, dramaMovie, curatedMovie;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-rec';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(MONGO_URI);
  recService = require('../api/src/services/recommendation.service');
  Movie = require('../api/src/models/Movie');
  UserInteraction = require('../api/src/models/UserInteraction');
  ConfigDictionary = require('../api/src/models/ConfigDictionary');

  await Movie.deleteMany({ title: /^recfix_/ });
  await UserInteraction.deleteMany({ user_id: { $in: [personalizedUserId, coldUserId, trendingBoostUserId] } });

  await ConfigDictionary.findOneAndUpdate(
    { key: 'featured_tags' },
    { key: 'featured_tags', value: ['recfix-curated'], category: 'tags' },
    { upsert: true }
  );

  actionMovieViewed = await Movie.create({
    title: 'recfix_ActionViewed', categories: ['action'], tags: [],
    is_published: true, popularity_score: 100, created_by: new mongoose.Types.ObjectId()
  });
  actionMovieUnviewed = await Movie.create({
    title: 'recfix_ActionUnviewed', categories: ['action'], tags: [],
    is_published: true, popularity_score: 80, created_by: new mongoose.Types.ObjectId()
  });
  dramaMovie = await Movie.create({
    title: 'recfix_Drama', categories: ['drama'], tags: [],
    is_published: true, popularity_score: 60, created_by: new mongoose.Types.ObjectId()
  });
  curatedMovie = await Movie.create({
    title: 'recfix_Curated', categories: ['indie'], tags: ['recfix-curated'],
    is_published: true, popularity_score: 40, created_by: new mongoose.Types.ObjectId()
  });

  await UserInteraction.create({
    user_id: personalizedUserId, entity_type: 'movie', entity_id: actionMovieViewed._id,
    action_type: 'view', timestamp: new Date()
  });

  for (let i = 0; i < 5; i++) {
    await UserInteraction.create({
      user_id: trendingBoostUserId, entity_type: 'movie', entity_id: dramaMovie._id,
      action_type: 'view', timestamp: new Date(Date.now() - i * 1000)
    });
  }
}, 30000);

afterAll(async () => {
  await Movie.deleteMany({ title: /^recfix_/ });
  await UserInteraction.deleteMany({ user_id: { $in: [personalizedUserId, coldUserId, trendingBoostUserId] } });
  await mongoose.disconnect();
});

describe('Recommendations — Cold Start branch', () => {
  test('no interactions => source is cold_start', async () => {
    const result = await recService.getRecommendations(coldUserId, 20);
    expect(result.source).toBe('cold_start');
  });

  test('cold_start result includes curated-tag movie', async () => {
    const result = await recService.getColdStartRecommendations(20);
    expect(result.source).toBe('cold_start');
    const ids = result.movies.map(m => m._id.toString());
    expect(ids).toContain(curatedMovie._id.toString());
  });

  test('cold_start result includes trending movies (by popularity)', async () => {
    const result = await recService.getColdStartRecommendations(20);
    const ids = result.movies.map(m => m._id.toString());
    const hasHighPopularity = ids.includes(actionMovieViewed._id.toString()) ||
                              ids.includes(actionMovieUnviewed._id.toString());
    expect(hasHighPopularity).toBe(true);
  });
});

describe('Recommendations — Personalized branch', () => {
  test('user with interactions => source is personalized', async () => {
    const result = await recService.getRecommendations(personalizedUserId, 20);
    expect(result.source).toBe('personalized');
  });

  test('personalized excludes the viewed movie by ID', async () => {
    const result = await recService.getRecommendations(personalizedUserId, 20);
    const ids = result.movies.map(m => m._id.toString());
    expect(ids).not.toContain(actionMovieViewed._id.toString());
  });

  test('personalized includes unviewed movie from same category (action)', async () => {
    const result = await recService.getRecommendations(personalizedUserId, 20);
    const ids = result.movies.map(m => m._id.toString());
    expect(ids).toContain(actionMovieUnviewed._id.toString());
  });

  test('personalized fills with trending when limit exceeds category matches', async () => {
    const result = await recService.getRecommendations(personalizedUserId, 100);
    expect(result.source).toBe('personalized');
    const ids = result.movies.map(m => m._id.toString());
    expect(ids).toContain(actionMovieUnviewed._id.toString());
    expect(ids).toContain(dramaMovie._id.toString());
    expect(ids).not.toContain(actionMovieViewed._id.toString());
  });
});

describe('Recommendations — getTrendingMovies', () => {
  test('returns movies as array', async () => {
    const movies = await recService.getTrendingMovies(5);
    expect(Array.isArray(movies)).toBe(true);
  });

  test('excludeIds removes specified movies', async () => {
    const movies = await recService.getTrendingMovies(10, [actionMovieViewed._id]);
    const ids = movies.map(m => m._id.toString());
    expect(ids).not.toContain(actionMovieViewed._id.toString());
  });
});

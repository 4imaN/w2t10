const fs = require('fs');
const path = require('path');
const Movie = require('../models/Movie');
const { computeFileFingerprint } = require('../utils/crypto');
const { NotFoundError } = require('../utils/errors');

function createSnapshot(movie, changedBy, changeType) {
  const snap = movie.toObject();
  delete snap.revisions;
  delete snap.__v;
  return {
    snapshot: snap,
    timestamp: new Date(),
    changed_by: changedBy,
    change_type: changeType
  };
}

async function createMovie(data, userId) {
  const movie = new Movie({
    title: data.title,
    description: data.description || '',
    categories: data.categories || [],
    tags: data.tags || [],
    mpaa_rating: data.mpaa_rating || 'NR',
    release_date: data.release_date || null,
    is_published: true,
    created_by: userId,
    revisions: []
  });

  await movie.save();

  // Add initial revision snapshot
  movie.revisions.push(createSnapshot(movie, userId, 'create'));
  await movie.save();

  return movie;
}

async function getMovies(filters = {}, page = 1, limit = 20, includeUnpublished = false) {
  const query = { deleted_at: null };
  if (!includeUnpublished) query.is_published = true;
  if (filters.category) query.categories = filters.category;
  if (filters.tag) query.tags = filters.tag;
  if (filters.mpaa_rating) query.mpaa_rating = filters.mpaa_rating;
  if (filters.search) {
    query.$text = { $search: filters.search };
  }

  let sort = { created_at: -1 };
  if (filters.sort === 'popularity') sort = { popularity_score: -1 };
  if (filters.sort === 'rating') sort = { mpaa_rating: 1 };
  if (filters.sort === 'newest') sort = { release_date: -1 };
  if (filters.sort === 'title') sort = { title: 1 };

  const total = await Movie.countDocuments(query);
  const movies = await Movie.find(query)
    .select('-revisions')
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);

  return { movies, total, page, pages: Math.ceil(total / limit) };
}

async function getMovieById(id, includeRevisions = false) {
  const select = includeRevisions ? {} : { revisions: 0 };
  const movie = await Movie.findOne({ _id: id, deleted_at: null }).select(select);
  if (!movie) throw new NotFoundError('Movie');
  return movie;
}

async function updateMovie(id, updates, userId) {
  const movie = await Movie.findOne({ _id: id, deleted_at: null });
  if (!movie) throw new NotFoundError('Movie');

  const allowedFields = ['title', 'description', 'categories', 'tags', 'mpaa_rating', 'release_date'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      movie[field] = updates[field];
    }
  }

  movie.revisions.push(createSnapshot(movie, userId, 'edit'));
  await movie.save();
  return movie;
}

async function unpublishMovie(id, userId) {
  const movie = await Movie.findOne({ _id: id, deleted_at: null });
  if (!movie) throw new NotFoundError('Movie');

  movie.is_published = false;
  movie.revisions.push(createSnapshot(movie, userId, 'unpublish'));
  await movie.save();
  return movie;
}

async function republishMovie(id, userId) {
  const movie = await Movie.findOne({ _id: id, deleted_at: null });
  if (!movie) throw new NotFoundError('Movie');

  movie.is_published = true;
  movie.revisions.push(createSnapshot(movie, userId, 'republish'));
  await movie.save();
  return movie;
}

async function uploadPoster(movieId, file, userId) {
  const movie = await Movie.findOne({ _id: movieId, deleted_at: null });
  if (!movie) throw new NotFoundError('Movie');

  const buffer = fs.readFileSync(file.path);
  const fingerprint = computeFileFingerprint(buffer);

  movie.poster = {
    filename: file.filename,
    original_name: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    fingerprint,
    path: file.path
  };

  movie.revisions.push(createSnapshot(movie, userId, 'edit'));
  await movie.save();
  return movie;
}

async function uploadStills(movieId, files, userId) {
  const movie = await Movie.findOne({ _id: movieId, deleted_at: null });
  if (!movie) throw new NotFoundError('Movie');

  for (const file of files) {
    const buffer = fs.readFileSync(file.path);
    const fingerprint = computeFileFingerprint(buffer);

    // Deduplicate by fingerprint
    const exists = movie.stills.find(s => s.fingerprint === fingerprint);
    if (!exists) {
      movie.stills.push({
        filename: file.filename,
        original_name: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        fingerprint,
        path: file.path
      });
    }
  }

  movie.revisions.push(createSnapshot(movie, userId, 'edit'));
  await movie.save();
  return movie;
}

async function deleteMovie(id) {
  const movie = await Movie.findOne({ _id: id, deleted_at: null });
  if (!movie) throw new NotFoundError('Movie');
  movie.deleted_at = new Date();
  await movie.save();
}

async function getRevisionHistory(id) {
  const movie = await Movie.findOne({ _id: id, deleted_at: null }).select('revisions title');
  if (!movie) throw new NotFoundError('Movie');
  return movie.revisions;
}

module.exports = {
  createMovie,
  getMovies,
  getMovieById,
  updateMovie,
  unpublishMovie,
  republishMovie,
  uploadPoster,
  uploadStills,
  deleteMovie,
  getRevisionHistory,
  createSnapshot
};

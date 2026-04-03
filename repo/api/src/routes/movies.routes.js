const express = require('express');
const router = express.Router();
const movieService = require('../services/movie.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { requireRole, staffOnly, allRoles } = require('../middleware/rbac.middleware');
const { createMovieValidation, mongoIdParam, paginationValidation } = require('../middleware/validation.middleware');
const { uploadPoster, uploadStills } = require('../utils/file-upload');

router.use(authMiddleware);

// GET /api/movies — browse movies (all roles)
router.get('/', allRoles, paginationValidation, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, tag, mpaa_rating, sort, search } = req.query;
    const includeUnpublished = ['administrator', 'editor'].includes(req.user.role);
    const result = await movieService.getMovies(
      { category, tag, mpaa_rating, sort, search },
      parseInt(page), parseInt(limit), includeUnpublished
    );
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/movies/:id
router.get('/:id', allRoles, mongoIdParam, async (req, res, next) => {
  try {
    // Only staff can request revisions via ?revisions=true
    const isStaffUser = ['administrator', 'editor'].includes(req.user.role);
    const includeRevisions = req.query.revisions === 'true' && isStaffUser;
    const movie = await movieService.getMovieById(req.params.id, includeRevisions);
    // Regular users cannot access unpublished movies
    if (!movie.is_published && !isStaffUser) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Movie not found' });
    }
    // Strip revisions from response for non-staff even if somehow present
    const movieObj = movie.toObject ? movie.toObject() : { ...movie };
    if (!isStaffUser) {
      delete movieObj.revisions;
    }
    // Track movie view for personalized recommendations
    const { trackInteraction } = require('../services/search.service');
    trackInteraction(req.user.id, 'movie', movie._id, 'view').catch(() => {});
    res.json({ movie: movieObj });
  } catch (err) { next(err); }
});

// GET /api/movies/:id/revisions
router.get('/:id/revisions', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    const revisions = await movieService.getRevisionHistory(req.params.id);
    res.json({ revisions });
  } catch (err) { next(err); }
});

// POST /api/movies
router.post('/', staffOnly, createMovieValidation, async (req, res, next) => {
  try {
    const movie = await movieService.createMovie(req.body, req.user.id);
    res.status(201).json({ movie });
  } catch (err) { next(err); }
});

// PUT /api/movies/:id
router.put('/:id', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    const movie = await movieService.updateMovie(req.params.id, req.body, req.user.id);
    res.json({ movie });
  } catch (err) { next(err); }
});

// POST /api/movies/:id/poster
router.post('/:id/poster', staffOnly, mongoIdParam, (req, res, next) => {
  req.uploadSubdir = 'posters';
  next();
}, uploadPoster.single('poster'), async (req, res, next) => {
  try {
    const movie = await movieService.uploadPoster(req.params.id, req.file, req.user.id);
    res.json({ movie });
  } catch (err) { next(err); }
});

// POST /api/movies/:id/stills
router.post('/:id/stills', staffOnly, mongoIdParam, (req, res, next) => {
  req.uploadSubdir = 'stills';
  next();
}, uploadStills.array('stills', 10), async (req, res, next) => {
  try {
    const movie = await movieService.uploadStills(req.params.id, req.files, req.user.id);
    res.json({ movie });
  } catch (err) { next(err); }
});

// POST /api/movies/:id/unpublish
router.post('/:id/unpublish', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    const movie = await movieService.unpublishMovie(req.params.id, req.user.id);
    res.json({ movie });
  } catch (err) { next(err); }
});

// POST /api/movies/:id/republish
router.post('/:id/republish', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    const movie = await movieService.republishMovie(req.params.id, req.user.id);
    res.json({ movie });
  } catch (err) { next(err); }
});

// DELETE /api/movies/:id
router.delete('/:id', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    await movieService.deleteMovie(req.params.id);
    res.json({ message: 'Movie deleted' });
  } catch (err) { next(err); }
});

module.exports = router;

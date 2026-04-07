const express = require('express');
const router = express.Router();
const searchService = require('../services/search.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { allRoles } = require('../middleware/rbac.middleware');

router.use(authMiddleware, allRoles);

const VALID_SORTS = {
  movie: ['popularity', 'newest', 'rating'],
  content: ['newest'],
  user: [],
};

router.get('/', async (req, res, next) => {
  try {
    const { q, type, sort, mpaa_rating, content_type, page = 1, limit = 20 } = req.query;

    if (sort && type && VALID_SORTS[type] && !VALID_SORTS[type].includes(sort)) {
      return res.status(422).json({
        code: 'VALIDATION_ERROR',
        message: `Sort '${sort}' is not supported for type '${type}'. Allowed: ${VALID_SORTS[type].join(', ') || 'none (relevance only)'}`
      });
    }

    const results = await searchService.unifiedSearch(
      q, { type, sort, mpaa_rating, content_type },
      parseInt(page), parseInt(limit), req.user.role
    );

    if (q) {
      searchService.trackInteraction(req.user.id, 'search', null, 'search', q).catch(() => {});
    }

    res.json(results);
  } catch (err) { next(err); }
});

router.get('/suggest', async (req, res, next) => {
  try {
    const suggestions = await searchService.getSuggestions(req.query.q);
    res.json({ suggestions });
  } catch (err) { next(err); }
});

module.exports = router;

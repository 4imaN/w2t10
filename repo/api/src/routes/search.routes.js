const express = require('express');
const router = express.Router();
const searchService = require('../services/search.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { allRoles } = require('../middleware/rbac.middleware');

router.use(authMiddleware, allRoles);

// GET /api/search?q=query&type=movie|content|user&sort=popularity|rating|newest
router.get('/', async (req, res, next) => {
  try {
    const { q, type, sort, mpaa_rating, content_type, page = 1, limit = 20 } = req.query;
    const results = await searchService.unifiedSearch(
      q, { type, sort, mpaa_rating, content_type },
      parseInt(page), parseInt(limit), req.user.role
    );

    // Track search interaction
    if (q) {
      searchService.trackInteraction(req.user.id, 'search', null, 'search', q).catch(() => {});
    }

    res.json(results);
  } catch (err) { next(err); }
});

// GET /api/search/suggest?q=partial
router.get('/suggest', async (req, res, next) => {
  try {
    const suggestions = await searchService.getSuggestions(req.query.q);
    res.json({ suggestions });
  } catch (err) { next(err); }
});

module.exports = router;

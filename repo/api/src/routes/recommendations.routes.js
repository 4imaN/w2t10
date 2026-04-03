const express = require('express');
const router = express.Router();
const recService = require('../services/recommendation.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { allRoles } = require('../middleware/rbac.middleware');

router.use(authMiddleware, allRoles);

// GET /api/recommendations/movies
router.get('/movies', async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;
    const result = await recService.getRecommendations(req.user.id, parseInt(limit));
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/recommendations/content
router.get('/content', async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const content = await recService.getRecommendedContent(req.user.id, parseInt(limit));
    res.json({ content });
  } catch (err) { next(err); }
});

module.exports = router;

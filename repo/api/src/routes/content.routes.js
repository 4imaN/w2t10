const express = require('express');
const router = express.Router();
const contentService = require('../services/content.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { requireRole, staffOnly, allRoles } = require('../middleware/rbac.middleware');
const { createContentValidation, mongoIdParam, paginationValidation } = require('../middleware/validation.middleware');

router.use(authMiddleware);

// GET /api/content — list content items
router.get('/', allRoles, paginationValidation, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, content_type, author, search } = req.query;
    const result = await contentService.getContentItems(
      { status, content_type, author, search },
      parseInt(page), parseInt(limit), req.user.role
    );
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/content/:id
router.get('/:id', allRoles, mongoIdParam, async (req, res, next) => {
  try {
    const item = await contentService.getContentById(req.params.id);
    // Only editorial roles can see non-published content
    const editorialRoles = ['administrator', 'editor', 'reviewer'];
    if (item.status !== 'published' && !editorialRoles.includes(req.user.role)) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Content not found' });
    }
    // Strip revisions from response for non-editorial roles
    const itemObj = item.toObject ? item.toObject() : { ...item };
    if (!editorialRoles.includes(req.user.role)) {
      delete itemObj.revisions;
    }
    res.json({ item: itemObj });
  } catch (err) { next(err); }
});

// GET /api/content/:id/reviews — review history
router.get('/:id/reviews', requireRole('administrator', 'editor', 'reviewer'), mongoIdParam, async (req, res, next) => {
  try {
    const reviews = await contentService.getReviewHistory(req.params.id);
    res.json({ reviews });
  } catch (err) { next(err); }
});

// POST /api/content
router.post('/', staffOnly, createContentValidation, async (req, res, next) => {
  try {
    const item = await contentService.createContent(req.body, req.user.id);
    res.status(201).json({ item });
  } catch (err) { next(err); }
});

// PUT /api/content/:id
router.put('/:id', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    const item = await contentService.updateContent(req.params.id, req.body, req.user.id);
    res.json({ item });
  } catch (err) { next(err); }
});

// POST /api/content/:id/submit — submit for review
router.post('/:id/submit', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    const result = await contentService.submitForReview(
      req.params.id, req.user.id, req.body.acknowledgedSensitiveWords
    );
    if (result.warning) {
      return res.status(200).json({
        warning: true,
        flagged_words: result.flagged_words,
        message: result.message,
        item: result.item
      });
    }
    res.json({ item: result.item });
  } catch (err) { next(err); }
});

// POST /api/content/:id/unpublish
router.post('/:id/unpublish', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    const item = await contentService.unpublishContent(req.params.id, req.user.id);
    res.json({ item });
  } catch (err) { next(err); }
});

// DELETE /api/content/:id
router.delete('/:id', staffOnly, mongoIdParam, async (req, res, next) => {
  try {
    await contentService.deleteContent(req.params.id);
    res.json({ message: 'Content deleted' });
  } catch (err) { next(err); }
});

module.exports = router;

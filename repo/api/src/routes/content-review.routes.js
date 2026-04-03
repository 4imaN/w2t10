const express = require('express');
const router = express.Router();
const contentService = require('../services/content.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { reviewerOnly } = require('../middleware/rbac.middleware');
const { reviewValidation, mongoIdParam } = require('../middleware/validation.middleware');

router.use(authMiddleware, reviewerOnly);

// POST /api/content-review/:id/review — review content (step 1 or 2)
router.post('/:id/review', mongoIdParam, reviewValidation, async (req, res, next) => {
  try {
    const { decision, rejection_reason } = req.body;

    // Determine which step based on content status
    const item = await contentService.getContentById(req.params.id);
    let step;
    if (item.status === 'in_review_1') step = 1;
    else if (item.status === 'in_review_2') step = 2;
    else {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Content is not in review status' });
    }

    const result = await contentService.reviewContent(
      req.params.id, req.user.id, step, decision, rejection_reason
    );
    res.json({ item: result });
  } catch (err) { next(err); }
});

module.exports = router;

const ContentItem = require('../models/ContentItem');
const ContentReview = require('../models/ContentReview');
const { validateContentTransition } = require('../utils/state-machine');
const { scanForSensitiveWords } = require('../utils/sensitive-words');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');

function validateTypeFields(data) {
  const errors = [];
  if (data.content_type === 'gallery') {
    if (data.gallery_items && !Array.isArray(data.gallery_items)) {
      errors.push('gallery_items must be an array');
    }
  }
  if (data.content_type === 'video') {
    if (!data.video_url && !data.body) {
      errors.push('Video content requires a video_url or body');
    }
  }
  if (data.content_type === 'event') {
    if (!data.event_date) {
      errors.push('Event content requires an event_date');
    }
    if (data.event_date && data.event_end_date && new Date(data.event_end_date) <= new Date(data.event_date)) {
      errors.push('event_end_date must be after event_date');
    }
  }
  if (errors.length > 0) {
    throw new ValidationError('Type-specific validation failed: ' + errors.join('; '));
  }
}

function extractTypeFields(data) {
  const fields = {};
  if (data.content_type === 'gallery') {
    fields.gallery_items = data.gallery_items || [];
  }
  if (data.content_type === 'video') {
    fields.video_url = data.video_url || null;
    fields.video_duration_seconds = data.video_duration_seconds || null;
    fields.video_format = data.video_format || null;
  }
  if (data.content_type === 'event') {
    fields.event_date = data.event_date || null;
    fields.event_end_date = data.event_end_date || null;
    fields.event_location = data.event_location || null;
    fields.event_capacity = data.event_capacity || null;
  }
  return fields;
}

async function createContent(data, userId) {
  validateTypeFields(data);
  const typeFields = extractTypeFields(data);

  const item = await ContentItem.create({
    content_type: data.content_type,
    title: data.title,
    body: data.body || '',
    ...typeFields,
    author: userId,
    status: 'draft',
    scheduled_publish_date: data.scheduled_publish_date || null,
    revisions: [{
      snapshot: { title: data.title, body: data.body || '', content_type: data.content_type, ...typeFields },
      timestamp: new Date(),
      changed_by: userId,
      change_type: 'create'
    }]
  });
  return item;
}

async function getContentItems(filters = {}, page = 1, limit = 20, userRole = 'regular_user') {
  const query = { deleted_at: null };

  // Only editorial roles (admin, editor, reviewer) can see non-published content
  const editorialRoles = ['administrator', 'editor', 'reviewer'];
  if (!editorialRoles.includes(userRole)) {
    query.status = 'published';
  } else if (filters.status) {
    query.status = filters.status;
  }

  if (filters.content_type) query.content_type = filters.content_type;
  if (filters.author) query.author = filters.author;
  if (filters.search) {
    query.$text = { $search: filters.search };
  }

  const total = await ContentItem.countDocuments(query);
  const items = await ContentItem.find(query)
    .select('-revisions')
    .populate('author', 'username display_name')
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return { items, total, page, pages: Math.ceil(total / limit) };
}

async function getContentById(id) {
  const item = await ContentItem.findOne({ _id: id, deleted_at: null })
    .populate('author', 'username display_name');
  if (!item) throw new NotFoundError('Content item');
  return item;
}

async function updateContent(id, updates, userId) {
  const item = await ContentItem.findOne({ _id: id, deleted_at: null });
  if (!item) throw new NotFoundError('Content item');

  if (item.status !== 'draft') {
    throw new ValidationError('Can only edit content in draft status');
  }

  if (updates.title !== undefined) item.title = updates.title;
  if (updates.body !== undefined) item.body = updates.body;
  if (updates.content_type !== undefined) item.content_type = updates.content_type;
  if (updates.scheduled_publish_date !== undefined) item.scheduled_publish_date = updates.scheduled_publish_date;

  // Type-specific fields
  validateTypeFields({ ...item.toObject(), ...updates });
  const typeFields = extractTypeFields(updates.content_type ? updates : { ...item.toObject(), ...updates });
  for (const [k, v] of Object.entries(typeFields)) {
    if (updates[k] !== undefined) item[k] = updates[k];
    else if (v !== undefined && item[k] === undefined) item[k] = v;
  }

  item.revisions.push({
    snapshot: { title: item.title, body: item.body, content_type: item.content_type, ...extractTypeFields(item) },
    timestamp: new Date(),
    changed_by: userId,
    change_type: 'edit'
  });

  await item.save();
  return item;
}

async function submitForReview(id, userId, acknowledgedSensitiveWords = false) {
  const item = await ContentItem.findOne({ _id: id, deleted_at: null });
  if (!item) throw new NotFoundError('Content item');

  if (!validateContentTransition(item.status, 'in_review_1')) {
    throw new ValidationError(`Cannot submit for review from status '${item.status}'`);
  }

  // Scan for sensitive words
  const flagged = await scanForSensitiveWords(item.title + ' ' + item.body);
  item.flagged_words = flagged;

  if (flagged.length > 0 && !acknowledgedSensitiveWords) {
    return {
      item,
      warning: true,
      flagged_words: flagged,
      message: 'Content contains sensitive words. Set acknowledgedSensitiveWords to true to submit anyway.'
    };
  }

  item.sensitive_words_acknowledged = flagged.length > 0 && acknowledgedSensitiveWords;
  item.status = 'in_review_1';

  item.revisions.push({
    snapshot: { title: item.title, body: item.body, status: 'in_review_1' },
    timestamp: new Date(),
    changed_by: userId,
    change_type: 'submit_review'
  });

  await item.save();
  return { item, warning: false };
}

async function reviewContent(contentId, reviewerId, step, decision, rejectionReason) {
  const item = await ContentItem.findOne({ _id: contentId, deleted_at: null });
  if (!item) throw new NotFoundError('Content item');

  const expectedStatus = step === 1 ? 'in_review_1' : 'in_review_2';
  if (item.status !== expectedStatus) {
    throw new ValidationError(`Content is not in ${expectedStatus} status`);
  }

  // Enforce different reviewers for step 1 and step 2
  if (step === 2) {
    const step1Review = await ContentReview.findOne({ content_item: contentId, step: 1, decision: 'approved' });
    if (step1Review && step1Review.reviewer.toString() === reviewerId.toString()) {
      throw new ForbiddenError('Step 2 reviewer must be different from step 1 reviewer');
    }
  }

  if (decision === 'rejected' && !rejectionReason) {
    throw new ValidationError('Rejection reason is required');
  }

  // Create review record
  await ContentReview.create({
    content_item: contentId,
    reviewer: reviewerId,
    step,
    decision,
    rejection_reason: decision === 'rejected' ? rejectionReason : null
  });

  if (decision === 'approved') {
    if (step === 1) {
      item.status = 'in_review_2';
    } else {
      // Step 2 approved — publish or schedule
      if (item.scheduled_publish_date && new Date(item.scheduled_publish_date) > new Date()) {
        item.status = 'scheduled';
      } else {
        item.status = 'published';
      }
    }
  } else {
    // Rejected — back to draft
    item.status = 'draft';
  }

  item.revisions.push({
    snapshot: { status: item.status, review_step: step, decision },
    timestamp: new Date(),
    changed_by: reviewerId,
    change_type: decision === 'approved' ? 'publish' : 'revision'
  });

  await item.save();
  return item;
}

async function publishScheduledContent() {
  const now = new Date();
  const items = await ContentItem.find({
    status: 'scheduled',
    scheduled_publish_date: { $lte: now },
    deleted_at: null
  });

  for (const item of items) {
    item.status = 'published';
    item.revisions.push({
      snapshot: { status: 'published' },
      timestamp: now,
      changed_by: null,
      change_type: 'publish'
    });
    await item.save();
  }

  return items.length;
}

async function unpublishContent(id, userId) {
  const item = await ContentItem.findOne({ _id: id, deleted_at: null });
  if (!item) throw new NotFoundError('Content item');

  if (!['published', 'scheduled'].includes(item.status)) {
    throw new ValidationError('Can only unpublish published or scheduled content');
  }

  item.status = 'unpublished';
  item.revisions.push({
    snapshot: { status: 'unpublished' },
    timestamp: new Date(),
    changed_by: userId,
    change_type: 'unpublish'
  });
  await item.save();
  return item;
}

async function deleteContent(id) {
  const item = await ContentItem.findOne({ _id: id, deleted_at: null });
  if (!item) throw new NotFoundError('Content item');
  item.deleted_at = new Date();
  await item.save();
}

async function getReviewHistory(contentId) {
  return ContentReview.find({ content_item: contentId })
    .populate('reviewer', 'username display_name')
    .sort({ created_at: 1 });
}

module.exports = {
  createContent,
  getContentItems,
  getContentById,
  updateContent,
  submitForReview,
  reviewContent,
  publishScheduledContent,
  unpublishContent,
  deleteContent,
  getReviewHistory
};

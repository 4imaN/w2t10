const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const ExtensionClient = require('../models/ExtensionClient');
const Movie = require('../models/Movie');
const ContentItem = require('../models/ContentItem');
const RideRequest = require('../models/RideRequest');
const { authMiddleware } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/rbac.middleware');

const API_KEY_PREFIX_LENGTH = 8;

async function extensionAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'API key required' });
  }

  const prefix = apiKey.substring(0, API_KEY_PREFIX_LENGTH);
  const candidates = await ExtensionClient.find({
    api_key_prefix: prefix,
    status: 'active'
  });

  let matchedClient = null;
  for (const client of candidates) {
    if (await bcrypt.compare(apiKey, client.api_key_hash)) {
      matchedClient = client;
      break;
    }
  }

  if (!matchedClient) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid API key' });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - 60000);

  await ExtensionClient.updateOne(
    { _id: matchedClient._id },
    { $pull: { rate_limit_hits: { timestamp: { $lt: windowStart } } } }
  );

  const freshClient = await ExtensionClient.findById(matchedClient._id);
  const recentHits = (freshClient.rate_limit_hits || []).filter(
    h => h.timestamp >= windowStart
  );

  if (recentHits.length >= matchedClient.rate_limit) {
    return res.status(429).json({ code: 'RATE_LIMITED', message: 'Rate limit exceeded' });
  }

  await ExtensionClient.updateOne(
    { _id: matchedClient._id },
    {
      $push: { rate_limit_hits: { timestamp: now } },
      $set: { last_used_at: now }
    }
  );

  req.extensionClient = matchedClient;
  next();
}

router.post('/clients', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { name, permissions, rate_limit } = req.body;
    const crypto = require('crypto');
    const rawKey = crypto.randomBytes(32).toString('hex');
    const prefix = rawKey.substring(0, API_KEY_PREFIX_LENGTH);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const client = await ExtensionClient.create({
      name,
      api_key_prefix: prefix,
      api_key_hash: keyHash,
      permissions: permissions || [],
      rate_limit: rate_limit || 120
    });

    res.status(201).json({
      client: { id: client._id, name: client.name },
      api_key: rawKey
    });
  } catch (err) { next(err); }
});

router.get('/clients', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const clients = await ExtensionClient.find().select('-api_key_hash -rate_limit_hits');
    res.json({ clients });
  } catch (err) { next(err); }
});

router.get('/movies', extensionAuth, async (req, res, next) => {
  try {
    const hasPermission = req.extensionClient.permissions.some(p => p.resource === 'movies');
    if (!hasPermission) return res.status(403).json({ code: 'FORBIDDEN', message: 'No permission for movies' });

    const movies = await Movie.find({ is_published: true, deleted_at: null })
      .select('-revisions')
      .sort({ created_at: -1 })
      .limit(parseInt(req.query.limit) || 100);
    res.json({ movies });
  } catch (err) { next(err); }
});

router.get('/content', extensionAuth, async (req, res, next) => {
  try {
    const hasPermission = req.extensionClient.permissions.some(p => p.resource === 'content');
    if (!hasPermission) return res.status(403).json({ code: 'FORBIDDEN', message: 'No permission for content' });

    const content = await ContentItem.find({ status: 'published', deleted_at: null })
      .select('-revisions')
      .sort({ created_at: -1 })
      .limit(parseInt(req.query.limit) || 100);
    res.json({ content });
  } catch (err) { next(err); }
});

const RIDES_SAFE_FIELDS = '_id pickup_text dropoff_text rider_count vehicle_type status is_carpool time_window_start time_window_end created_at';
const RIDES_ALLOWED_STATUSES = ['pending_match', 'accepted', 'in_progress', 'completed', 'canceled'];

router.get('/rides', extensionAuth, async (req, res, next) => {
  try {
    const perm = req.extensionClient.permissions.find(p => p.resource === 'rides');
    if (!perm) return res.status(403).json({ code: 'FORBIDDEN', message: 'No permission for rides' });

    const policyStatuses = perm.allowed_statuses && perm.allowed_statuses.length > 0
      ? perm.allowed_statuses
      : RIDES_ALLOWED_STATUSES;

    const query = { deleted_at: null };

    if (req.query.status) {
      if (!RIDES_ALLOWED_STATUSES.includes(req.query.status)) {
        return res.status(422).json({ code: 'VALIDATION_ERROR', message: `Invalid status filter. Allowed: ${RIDES_ALLOWED_STATUSES.join(', ')}` });
      }
      if (!policyStatuses.includes(req.query.status)) {
        return res.status(403).json({ code: 'FORBIDDEN', message: `Client policy does not allow status '${req.query.status}'` });
      }
      query.status = req.query.status;
    } else {
      query.status = { $in: policyStatuses };
    }

    const policyOldest = perm.max_age_days
      ? new Date(Date.now() - perm.max_age_days * 86400000)
      : null;
    const requestedFrom = req.query.from ? new Date(req.query.from) : null;

    let effectiveFrom = policyOldest;
    if (requestedFrom && policyOldest) {
      effectiveFrom = requestedFrom > policyOldest ? requestedFrom : policyOldest;
    } else if (requestedFrom) {
      effectiveFrom = requestedFrom;
    }

    if (effectiveFrom) query.created_at = { $gte: effectiveFrom };
    if (req.query.to) query.created_at = { ...query.created_at, $lte: new Date(req.query.to) };

    const rides = await RideRequest.find(query)
      .select(RIDES_SAFE_FIELDS)
      .sort({ created_at: -1 })
      .limit(parseInt(req.query.limit) || 100);
    res.json({ rides });
  } catch (err) { next(err); }
});

module.exports = router;

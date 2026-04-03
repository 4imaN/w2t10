const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const ExtensionClient = require('../models/ExtensionClient');
const Movie = require('../models/Movie');
const ContentItem = require('../models/ContentItem');
const RideRequest = require('../models/RideRequest');
const { authMiddleware } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/rbac.middleware');

// Rate limiting state (in-memory)
const rateLimitMap = new Map();

async function extensionAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'API key required' });
  }

  const clients = await ExtensionClient.find({ status: 'active' });
  let matchedClient = null;
  for (const client of clients) {
    if (await bcrypt.compare(apiKey, client.api_key_hash)) {
      matchedClient = client;
      break;
    }
  }

  if (!matchedClient) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid API key' });
  }

  // Rate limiting
  const clientId = matchedClient._id.toString();
  const now = Date.now();
  const windowStart = now - 60000;
  const requests = rateLimitMap.get(clientId) || [];
  const recentRequests = requests.filter(t => t > windowStart);

  if (recentRequests.length >= matchedClient.rate_limit) {
    return res.status(429).json({ code: 'RATE_LIMITED', message: 'Rate limit exceeded' });
  }

  recentRequests.push(now);
  rateLimitMap.set(clientId, recentRequests);

  matchedClient.last_used_at = new Date();
  await matchedClient.save();

  req.extensionClient = matchedClient;
  next();
}

// Admin endpoints for managing extension clients
router.post('/clients', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { name, permissions, rate_limit } = req.body;
    const crypto = require('crypto');
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(rawKey, 10);

    const client = await ExtensionClient.create({
      name,
      api_key_hash: keyHash,
      permissions: permissions || [],
      rate_limit: rate_limit || 120
    });

    res.status(201).json({
      client: { id: client._id, name: client.name },
      api_key: rawKey // Only shown once
    });
  } catch (err) { next(err); }
});

router.get('/clients', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const clients = await ExtensionClient.find().select('-api_key_hash');
    res.json({ clients });
  } catch (err) { next(err); }
});

// Extension data endpoints
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

router.get('/rides', extensionAuth, async (req, res, next) => {
  try {
    const hasPermission = req.extensionClient.permissions.some(p => p.resource === 'rides');
    if (!hasPermission) return res.status(403).json({ code: 'FORBIDDEN', message: 'No permission for rides' });

    const rides = await RideRequest.find({ deleted_at: null })
      .sort({ created_at: -1 })
      .limit(parseInt(req.query.limit) || 100);
    res.json({ rides });
  } catch (err) { next(err); }
});

module.exports = router;

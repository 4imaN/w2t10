const express = require('express');
const router = express.Router();
const configService = require('../services/config.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/rbac.middleware');
const { configValidation, configUpdateValidation } = require('../middleware/validation.middleware');

router.use(authMiddleware, adminOnly);

router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    const configs = await configService.getAllConfigs(category);
    res.json({ configs });
  } catch (err) { next(err); }
});

router.get('/:key', async (req, res, next) => {
  try {
    const value = await configService.getConfig(req.params.key);
    if (value === null) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Config key not found' });
    }
    res.json({ key: req.params.key, value });
  } catch (err) { next(err); }
});

router.post('/', configValidation, async (req, res, next) => {
  try {
    const { key, value, category, description } = req.body;
    const config = await configService.setConfig(key, value, category, description);
    res.status(201).json({ config });
  } catch (err) { next(err); }
});

router.put('/:key', configUpdateValidation, async (req, res, next) => {
  try {
    const { value, category, description } = req.body;
    const config = await configService.setConfig(req.params.key, value, category, description);
    res.json({ config });
  } catch (err) { next(err); }
});

router.delete('/:key', async (req, res, next) => {
  try {
    await configService.deleteConfig(req.params.key);
    res.json({ message: 'Config deleted' });
  } catch (err) { next(err); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const importService = require('../services/movie-import.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { staffOnly } = require('../middleware/rbac.middleware');
const { uploadGeneral } = require('../utils/file-upload');

router.use(authMiddleware, staffOnly);

// POST /api/movie-import/upload — upload import file
router.post('/upload', (req, res, next) => {
  // Set subdir and ensure it exists before multer writes
  req.uploadSubdir = 'imports';
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(process.env.UPLOAD_DIR || './uploads', 'imports');
  fs.mkdirSync(dir, { recursive: true });
  next();
}, uploadGeneral.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'No file uploaded' });
    }

    const ext = req.file.originalname.toLowerCase().split('.').pop();
    if (!['json', 'csv'].includes(ext)) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Only JSON and CSV files are accepted' });
    }

    const fs = require('fs');
    const content = fs.readFileSync(req.file.path, 'utf-8');

    if (ext === 'json') {
      try { JSON.parse(content); }
      catch { return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON content' }); }
    }

    if (ext === 'csv') {
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'CSV must have a header row and at least one data row' });
      }
    }

    const job = await importService.createImportJob(content, req.file.originalname, req.user.id);
    res.status(201).json({ job });
  } catch (err) { next(err); }
});

// GET /api/movie-import/:jobId — get import job status
router.get('/:jobId', async (req, res, next) => {
  try {
    const job = await importService.getImportJob(req.params.jobId);
    res.json({ job });
  } catch (err) { next(err); }
});

// PUT /api/movie-import/:jobId/resolve/:recordIndex — resolve conflicts for a record
router.put('/:jobId/resolve/:recordIndex', async (req, res, next) => {
  try {
    const job = await importService.resolveConflict(
      req.params.jobId,
      parseInt(req.params.recordIndex),
      req.body.resolutions,
      req.user.id
    );
    res.json({ job });
  } catch (err) { next(err); }
});

router.post('/:jobId/skip/:recordIndex', async (req, res, next) => {
  try {
    const job = await importService.skipRecord(
      req.params.jobId,
      parseInt(req.params.recordIndex),
      req.user.id
    );
    res.json({ job });
  } catch (err) { next(err); }
});

// POST /api/movie-import/:jobId/execute — execute the import
router.post('/:jobId/execute', async (req, res, next) => {
  try {
    const job = await importService.executeImport(req.params.jobId, req.user.id);
    res.json({ job });
  } catch (err) { next(err); }
});

module.exports = router;

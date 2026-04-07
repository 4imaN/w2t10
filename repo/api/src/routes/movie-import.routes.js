const express = require('express');
const router = express.Router();
const importService = require('../services/movie-import.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { staffOnly } = require('../middleware/rbac.middleware');
const { uploadGeneral } = require('../utils/file-upload');

const { ForbiddenError } = require('../utils/errors');

router.use(authMiddleware, staffOnly);

async function enforceJobOwnership(req) {
  const job = await importService.getImportJob(req.params.jobId);
  if (req.user.role !== 'administrator' && job.uploaded_by.toString() !== req.user.id.toString()) {
    throw new ForbiddenError('Only the uploader or an admin can access this import job');
  }
  return job;
}

function cleanupFile(filePath) {
  if (!filePath) return;
  try { require('fs').unlinkSync(filePath); } catch {}
}

router.post('/upload', (req, res, next) => {
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
      cleanupFile(req.file.path);
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Only JSON and CSV files are accepted' });
    }

    const fs = require('fs');
    const content = fs.readFileSync(req.file.path, 'utf-8');

    if (ext === 'json') {
      try { JSON.parse(content); }
      catch {
        cleanupFile(req.file.path);
        return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON content' });
      }
    }

    if (ext === 'csv') {
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        cleanupFile(req.file.path);
        return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'CSV must have a header row and at least one data row' });
      }
    }

    const job = await importService.createImportJob(content, req.file.originalname, req.user.id);
    cleanupFile(req.file.path);
    res.status(201).json({ job });
  } catch (err) {
    cleanupFile(req.file?.path);
    next(err);
  }
});

router.get('/:jobId', async (req, res, next) => {
  try {
    const job = await enforceJobOwnership(req);
    res.json({ job });
  } catch (err) { next(err); }
});

router.put('/:jobId/resolve/:recordIndex', async (req, res, next) => {
  try {
    await enforceJobOwnership(req);
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
    await enforceJobOwnership(req);
    const job = await importService.skipRecord(
      req.params.jobId,
      parseInt(req.params.recordIndex),
      req.user.id
    );
    res.json({ job });
  } catch (err) { next(err); }
});

router.post('/:jobId/execute', async (req, res, next) => {
  try {
    await enforceJobOwnership(req);
    const job = await importService.executeImport(req.params.jobId, req.user.id);
    res.json({ job });
  } catch (err) { next(err); }
});

module.exports = router;

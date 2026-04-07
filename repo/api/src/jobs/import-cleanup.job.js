const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const IMPORT_DIR = path.join(process.env.UPLOAD_DIR || './uploads', 'imports');
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function runImportCleanup() {
  try {
    if (!fs.existsSync(IMPORT_DIR)) return;

    const now = Date.now();
    const files = fs.readdirSync(IMPORT_DIR);
    let removed = 0;

    for (const file of files) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(IMPORT_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch {}
    }

    if (removed > 0) {
      logger.info('import-cleanup completed', { job: 'import-cleanup', removed });
    }
  } catch (err) {
    logger.error('import-cleanup failed', { job: 'import-cleanup', error: err.message });
  }
}

module.exports = { runImportCleanup, IMPORT_DIR, MAX_AGE_MS };

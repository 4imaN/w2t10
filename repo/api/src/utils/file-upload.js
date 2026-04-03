const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subdir = req.uploadSubdir || 'general';
    cb(null, path.join(UPLOAD_DIR, subdir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIMETYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
    cb(new Error('Only JPG and PNG files are allowed'), false);
    return;
  }
  cb(null, true);
};

const uploadPoster = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

const uploadStills = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

const uploadGeneral = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE }
});

module.exports = {
  uploadPoster,
  uploadStills,
  uploadGeneral,
  UPLOAD_DIR,
  MAX_FILE_SIZE
};

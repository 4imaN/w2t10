const { AppError } = require('../utils/errors');

function errorHandler(err, req, res, _next) {
  // Multer file size errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(422).json({
      code: 'FILE_TOO_LARGE',
      message: 'File exceeds maximum allowed size of 10 MB'
    });
  }

  // Multer file type errors
  if (err.message && err.message.includes('Only JPG and PNG')) {
    return res.status(422).json({
      code: 'INVALID_FILE_TYPE',
      message: err.message
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(422).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details
    });
  }

  // Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      code: 'DUPLICATE',
      message: `Duplicate value for ${field}`
    });
  }

  // App errors
  if (err instanceof AppError) {
    const response = {
      code: err.code,
      message: err.message
    };
    if (err.details) response.details = err.details;
    return res.status(err.statusCode).json(response);
  }

  // Unknown errors
  console.error('Unhandled error:', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
}

module.exports = { errorHandler };

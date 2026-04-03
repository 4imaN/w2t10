const { body, param, query, validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: errors.array().map(e => ({
        field: e.path,
        message: e.msg,
        value: e.value
      }))
    });
  }
  next();
}

// Auth validations
const loginValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

// User validations
const createUserValidation = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(['administrator', 'editor', 'reviewer', 'dispatcher', 'regular_user']).withMessage('Invalid role'),
  body('display_name').optional().trim().isLength({ max: 100 }),
  body('phone').optional().trim(),
  validate
];

// Movie validations
const createMovieValidation = [
  body('title').trim().notEmpty().isLength({ max: 300 }).withMessage('Title required, max 300 chars'),
  body('description').optional().isLength({ max: 5000 }),
  body('categories').optional().isArray(),
  body('tags').optional().isArray(),
  body('mpaa_rating').optional().isIn(['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR']),
  body('release_date').optional().isISO8601(),
  validate
];

// Content validations
const createContentValidation = [
  body('content_type').isIn(['article', 'gallery', 'video', 'event']).withMessage('Invalid content type'),
  body('title').trim().notEmpty().isLength({ max: 300 }).withMessage('Title required, max 300 chars'),
  body('body').optional(),
  body('scheduled_publish_date').optional().isISO8601(),
  validate
];

// Ride request validations
const createRideValidation = [
  body('pickup_text').trim().notEmpty().isLength({ max: 500 }).withMessage('Pickup location required'),
  body('dropoff_text').trim().notEmpty().isLength({ max: 500 }).withMessage('Dropoff location required'),
  body('rider_count').isInt({ min: 1, max: 6 }).withMessage('Rider count must be 1-6'),
  body('time_window_start').isISO8601().withMessage('Valid start time required'),
  body('time_window_end').isISO8601().withMessage('Valid end time required'),
  body('vehicle_type').optional().isIn(['sedan', 'suv', 'van', 'shuttle']),
  body('is_carpool').optional().isBoolean(),
  validate
];

// Content review validations
const reviewValidation = [
  body('decision').isIn(['approved', 'rejected']).withMessage('Decision must be approved or rejected'),
  body('rejection_reason')
    .if(body('decision').equals('rejected'))
    .notEmpty().withMessage('Rejection reason is required when rejecting'),
  validate
];

// Ledger entry validations
const ledgerEntryValidation = [
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be non-negative'),
  body('payment_method').isIn(['cash', 'card_on_file']).withMessage('Invalid payment method'),
  body('receipt_number').trim().notEmpty().withMessage('Receipt number required'),
  body('idempotency_key').trim().notEmpty().withMessage('Idempotency key required'),
  body('ride_request').optional().isMongoId(),
  validate
];

// Sensor ingest validations
const sensorIngestValidation = [
  body('device_id').trim().notEmpty().withMessage('Device ID required'),
  body('timestamp').isISO8601().withMessage('Valid timestamp required'),
  body('value').isNumeric().withMessage('Numeric value required'),
  validate
];

// Dispute validations
const createDisputeValidation = [
  body('ride_request').isMongoId().withMessage('Valid ride request ID required'),
  body('reason').isIn(['no_show', 'wrong_route', 'fare_dispute', 'service_complaint', 'other']).withMessage('Invalid dispute reason'),
  body('detail').optional().isLength({ max: 2000 }),
  validate
];

// Config validations
const configValidation = [
  body('key').trim().notEmpty().withMessage('Config key required'),
  body('value').exists().withMessage('Config value required'),
  body('category').isIn(['statuses', 'tags', 'priority', 'thresholds', 'general', 'vehicle_types', 'ratings', 'sensitive_words']).withMessage('Invalid category'),
  body('description').optional(),
  validate
];

// Pagination query validation
const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validate
];

const mongoIdParam = [
  param('id').isMongoId().withMessage('Invalid ID format'),
  validate
];

module.exports = {
  validate,
  loginValidation,
  createUserValidation,
  createMovieValidation,
  createContentValidation,
  createRideValidation,
  reviewValidation,
  ledgerEntryValidation,
  sensorIngestValidation,
  createDisputeValidation,
  configValidation,
  paginationValidation,
  mongoIdParam
};

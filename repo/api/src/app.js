const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const path = require('path');
const cron = require('node-cron');

// Load env from .env file if not already set (optional dotenv)
if (!process.env.MONGO_URI) {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  } catch {
    // dotenv not installed — env vars must be set externally
  }
}

const { errorHandler } = require('./middleware/error-handler.middleware');

// Import routes
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const moviesRoutes = require('./routes/movies.routes');
const movieImportRoutes = require('./routes/movie-import.routes');
const contentRoutes = require('./routes/content.routes');
const contentReviewRoutes = require('./routes/content-review.routes');
const ridesRoutes = require('./routes/rides.routes');
const dispatchRoutes = require('./routes/dispatch.routes');
const disputesRoutes = require('./routes/disputes.routes');
const searchRoutes = require('./routes/search.routes');
const recommendationsRoutes = require('./routes/recommendations.routes');
const sensorsRoutes = require('./routes/sensors.routes');
const ledgerRoutes = require('./routes/ledger.routes');
const configRoutes = require('./routes/config.routes');
const extensionsRoutes = require('./routes/extensions.routes');

// Import jobs
const { runAutoCancel } = require('./jobs/auto-cancel.job');
const { runScheduledPublish } = require('./jobs/scheduled-publish.job');
const { runSensorCleanup } = require('./jobs/sensor-cleanup.job');
const { runLedgerRetry } = require('./jobs/ledger-retry.job');
const { runSuggestionsRefresh } = require('./jobs/suggestions-refresh.job');

const app = express();
const PORT = process.env.API_PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride';

// Middleware
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('short'));

// Serve uploaded files
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CineRide API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/movie-import', movieImportRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/content-review', contentReviewRoutes);
app.use('/api/rides', ridesRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/disputes', disputesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/sensors', sensorsRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/config', configRoutes);
app.use('/api/extensions', extensionsRoutes);

// OpenAPI docs — interactive Swagger UI pages
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('./docs/openapi.json');
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CineRide API Docs'
}));
// Also serve raw JSON for programmatic access
app.get('/api/docs.json', (req, res) => res.json(openApiSpec));

// Error handler
app.use(errorHandler);

// Database connection and server start
async function start() {
  // Validate required environment variables before anything else
  const { validateEnv } = require('./utils/env');
  validateEnv();

  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Run seed on first start
    const User = require('./models/User');
    const count = await User.countDocuments();
    if (count === 0) {
      console.log('Empty database detected — running seed...');
      const { seed } = require('./db/seed');
      await seed(true);
    }

    const { migratePhonesToEncrypted } = require('./services/user.service');
    const migrated = await migratePhonesToEncrypted();
    if (migrated > 0) console.log(`Migrated ${migrated} plaintext phone(s) to encrypted storage`);

    // Schedule cron jobs
    cron.schedule('* * * * *', runAutoCancel);          // Every minute
    cron.schedule('* * * * *', runScheduledPublish);    // Every minute
    cron.schedule('0 3 * * *', runSensorCleanup);       // Daily at 3 AM
    cron.schedule('*/5 * * * *', runLedgerRetry);       // Every 5 minutes
    cron.schedule('0 2 * * *', runSuggestionsRefresh);  // Daily at 2 AM

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`CineRide API running on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down...');
      server.close();
      await mongoose.disconnect();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

// Only start server if not imported for testing
if (require.main === module) {
  start();
}

module.exports = app;

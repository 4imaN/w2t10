const express = require('express');
const mongoose = require('mongoose');

const path = require('path');
const cron = require('node-cron');

if (!process.env.MONGO_URI) {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  } catch {
  }
}

const { errorHandler } = require('./middleware/error-handler.middleware');

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

const { runAutoCancel } = require('./jobs/auto-cancel.job');
const { runScheduledPublish } = require('./jobs/scheduled-publish.job');
const { runSensorCleanup } = require('./jobs/sensor-cleanup.job');
const { runLedgerRetry } = require('./jobs/ledger-retry.job');
const { runSuggestionsRefresh } = require('./jobs/suggestions-refresh.job');
const { runImportCleanup } = require('./jobs/import-cleanup.job');

const app = express();
const PORT = process.env.API_PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride';

const { requestLogger } = require('./utils/logger');

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger());

const uploadsBase = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
app.use('/uploads/posters', express.static(path.join(uploadsBase, 'posters')));
app.use('/uploads/stills', express.static(path.join(uploadsBase, 'stills')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CineRide API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

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

const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('./docs/openapi.json');
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CineRide API Docs'
}));
app.get('/api/docs.json', (req, res) => res.json(openApiSpec));

app.use(errorHandler);

async function start() {
  const { validateEnv } = require('./utils/env');
  validateEnv();

  try {
    const { logger } = require('./utils/logger');
    await mongoose.connect(MONGO_URI);
    logger.info('Connected to MongoDB');

    const User = require('./models/User');
    const count = await User.countDocuments();
    if (count === 0) {
      logger.info('Empty database detected — running seed...');
      const { seed } = require('./db/seed');
      await seed(true);
    }

    const { migratePhonesToEncrypted } = require('./services/user.service');
    const migrated = await migratePhonesToEncrypted();
    if (migrated > 0) logger.info('Phone migration completed', { migrated });

    cron.schedule('* * * * *', runAutoCancel);
    cron.schedule('* * * * *', runScheduledPublish);
    cron.schedule('0 3 * * *', runSensorCleanup);
    cron.schedule('*/5 * * * *', runLedgerRetry);
    cron.schedule('0 2 * * *', runSuggestionsRefresh);
    cron.schedule('0 4 * * *', runImportCleanup);

    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('CineRide API running', { port: PORT });
    });

    const shutdown = async () => {
      logger.info('Shutting down...');
      server.close();
      await mongoose.disconnect();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err) {
    logger.error('Failed to start', { error: err.message });
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;

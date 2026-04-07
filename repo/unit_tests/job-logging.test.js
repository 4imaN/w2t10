const { logger } = require('../api/src/utils/logger');

let logCalls;
const origInfo = logger.info;
const origError = logger.error;

beforeEach(() => {
  logCalls = { info: [], error: [] };
  logger.info = (msg, meta) => logCalls.info.push({ msg, meta });
  logger.error = (msg, meta) => logCalls.error.push({ msg, meta });
});

afterAll(() => {
  logger.info = origInfo;
  logger.error = origError;
});

describe('Job Logging — auto-cancel', () => {
  let runAutoCancel;
  const rideService = require('../api/src/services/ride.service');

  beforeAll(() => {
    ({ runAutoCancel } = require('../api/src/jobs/auto-cancel.job'));
  });

  test('logs info with job name and count on success', async () => {
    const orig = rideService.autoCancelExpiredRequests;
    rideService.autoCancelExpiredRequests = async () => 3;

    await runAutoCancel();

    expect(logCalls.info.length).toBe(1);
    expect(logCalls.info[0].msg).toContain('auto-cancel');
    expect(logCalls.info[0].meta.job).toBe('auto-cancel');
    expect(logCalls.info[0].meta.canceled).toBe(3);

    rideService.autoCancelExpiredRequests = orig;
  });

  test('logs error on failure', async () => {
    const orig = rideService.autoCancelExpiredRequests;
    rideService.autoCancelExpiredRequests = async () => { throw new Error('db down'); };

    await runAutoCancel();

    expect(logCalls.error.length).toBe(1);
    expect(logCalls.error[0].meta.error).toBe('db down');

    rideService.autoCancelExpiredRequests = orig;
  });

  test('does not log when count is zero', async () => {
    const orig = rideService.autoCancelExpiredRequests;
    rideService.autoCancelExpiredRequests = async () => 0;

    await runAutoCancel();

    expect(logCalls.info.length).toBe(0);
    expect(logCalls.error.length).toBe(0);

    rideService.autoCancelExpiredRequests = orig;
  });
});

describe('Job Logging — scheduled-publish', () => {
  let runScheduledPublish;
  const contentService = require('../api/src/services/content.service');

  beforeAll(() => {
    ({ runScheduledPublish } = require('../api/src/jobs/scheduled-publish.job'));
  });

  test('logs info with job name and count on success', async () => {
    const orig = contentService.publishScheduledContent;
    contentService.publishScheduledContent = async () => 5;

    await runScheduledPublish();

    expect(logCalls.info.length).toBe(1);
    expect(logCalls.info[0].meta.job).toBe('scheduled-publish');
    expect(logCalls.info[0].meta.published).toBe(5);

    contentService.publishScheduledContent = orig;
  });
});

describe('Job Logging — sensor-cleanup', () => {
  let runSensorCleanup;
  const sensorService = require('../api/src/services/sensor.service');

  beforeAll(() => {
    ({ runSensorCleanup } = require('../api/src/jobs/sensor-cleanup.job'));
  });

  test('logs info with removed count', async () => {
    const orig = sensorService.cleanupExpiredReadings;
    sensorService.cleanupExpiredReadings = async () => 42;

    await runSensorCleanup();

    expect(logCalls.info.length).toBe(1);
    expect(logCalls.info[0].meta.job).toBe('sensor-cleanup');
    expect(logCalls.info[0].meta.removed).toBe(42);

    sensorService.cleanupExpiredReadings = orig;
  });
});

describe('Job Logging — ledger-retry', () => {
  let runLedgerRetry;
  const ledgerService = require('../api/src/services/ledger.service');

  beforeAll(() => {
    ({ runLedgerRetry } = require('../api/src/jobs/ledger-retry.job'));
  });

  test('logs info with retried count', async () => {
    const orig = ledgerService.retryFailedEntries;
    ledgerService.retryFailedEntries = async () => 7;

    await runLedgerRetry();

    expect(logCalls.info.length).toBe(1);
    expect(logCalls.info[0].meta.job).toBe('ledger-retry');
    expect(logCalls.info[0].meta.retried).toBe(7);

    ledgerService.retryFailedEntries = orig;
  });
});

describe('Job Logging — suggestions-refresh', () => {
  let runSuggestionsRefresh;
  const searchService = require('../api/src/services/search.service');

  beforeAll(() => {
    ({ runSuggestionsRefresh } = require('../api/src/jobs/suggestions-refresh.job'));
  });

  test('logs info with refreshed count', async () => {
    const orig = searchService.refreshSuggestions;
    searchService.refreshSuggestions = async () => 150;

    await runSuggestionsRefresh();

    expect(logCalls.info.length).toBe(1);
    expect(logCalls.info[0].meta.job).toBe('suggestions-refresh');
    expect(logCalls.info[0].meta.refreshed).toBe(150);

    searchService.refreshSuggestions = orig;
  });
});

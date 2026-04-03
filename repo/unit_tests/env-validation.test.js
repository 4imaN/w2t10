describe('Environment Validation', () => {
  const originalEnv = { ...process.env };
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
  });
  const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    process.env = { ...originalEnv };
    mockExit.mockClear();
    mockConsoleError.mockClear();
    // Clear require cache so validateEnv re-reads env
    delete require.cache[require.resolve('../api/src/utils/env')];
  });

  afterAll(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  test('fails when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { validateEnv } = require('../api/src/utils/env');
    expect(() => validateEnv()).toThrow('process.exit called');
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'));
  });

  test('fails when JWT_SECRET is an insecure default (non-test mode)', () => {
    process.env.JWT_SECRET = 'cineride-local-secret-change-in-production';
    process.env.NODE_ENV = 'development';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { validateEnv } = require('../api/src/utils/env');
    expect(() => validateEnv()).toThrow('process.exit called');
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('insecure default'));
  });

  test('fails when JWT_SECRET is the .env.example placeholder (non-test mode)', () => {
    process.env.JWT_SECRET = 'CHANGE_ME_GENERATE_WITH_CRYPTO';
    process.env.NODE_ENV = 'development';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { validateEnv } = require('../api/src/utils/env');
    expect(() => validateEnv()).toThrow('process.exit called');
  });

  test('allows insecure JWT_SECRET in test mode', () => {
    process.env.JWT_SECRET = 'cineride-local-secret-change-in-production';
    process.env.NODE_ENV = 'test';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { validateEnv } = require('../api/src/utils/env');
    expect(() => validateEnv()).not.toThrow();
  });

  test('fails when ENCRYPTION_KEY is missing', () => {
    process.env.JWT_SECRET = 'some-real-secret';
    delete process.env.ENCRYPTION_KEY;
    const { validateEnv } = require('../api/src/utils/env');
    expect(() => validateEnv()).toThrow('process.exit called');
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('ENCRYPTION_KEY'));
  });

  test('fails when ENCRYPTION_KEY is wrong length', () => {
    process.env.JWT_SECRET = 'some-real-secret';
    process.env.ENCRYPTION_KEY = 'tooshort';
    const { validateEnv } = require('../api/src/utils/env');
    expect(() => validateEnv()).toThrow('process.exit called');
  });

  test('passes with valid configuration', () => {
    process.env.JWT_SECRET = 'a-sufficiently-unique-secret-for-production';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { validateEnv } = require('../api/src/utils/env');
    expect(() => validateEnv()).not.toThrow();
  });
});

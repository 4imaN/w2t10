module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/unit_tests/**/*.test.js',
    '<rootDir>/API_tests/**/*.test.js'
  ],
  testTimeout: 60000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true
};

const { MongoMemoryServer } = require('mongodb-memory-server');

console.log('Ensuring MongoDB test binary is downloaded...');
console.log('This is a one-time download (~90MB). Subsequent runs use the cached binary.');

MongoMemoryServer.create()
  .then(async (mongod) => {
    console.log('MongoDB binary ready at: ' + mongod.getUri());
    await mongod.stop();
    console.log('Test database setup complete. Run: npm run test:api:mem');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to set up test database:', err.message);
    process.exit(1);
  });

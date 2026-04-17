/**
 * Global Jest setup — ensures both the root and api mongoose instances
 * connect to the same database. Required when running tests in Docker
 * where root and api have separate node_modules.
 */
const mongoose = require('mongoose');

module.exports = async function globalSetup() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

  // Connect the root mongoose instance
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  // Also connect the api's mongoose if it's a separate instance
  try {
    const apiMongoose = require('./api/node_modules/mongoose');
    if (apiMongoose !== mongoose && apiMongoose.connection.readyState === 0) {
      await apiMongoose.connect(uri);
    }
  } catch {
    // api shares the same mongoose — no action needed
  }
};

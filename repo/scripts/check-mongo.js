const mongoose = require('mongoose');

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 })
  .then(() => {
    console.log('MongoDB reachable at ' + uri);
    return mongoose.disconnect();
  })
  .catch(() => {
    console.error('');
    console.error('ERROR: MongoDB is not reachable at ' + uri);
    console.error('');
    console.error('To start MongoDB via Docker:');
    console.error('  docker compose up -d cineride-db');
    console.error('');
    console.error('To use a different URI:');
    console.error('  MONGO_URI=mongodb://host:port/db npm run test:api');
    console.error('');
    console.error('To run unit tests only (no DB needed):');
    console.error('  npm run test:unit');
    console.error('');
    process.exit(1);
  });

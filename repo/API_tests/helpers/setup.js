const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

async function startTestDb() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;

  const mongoose = require('mongoose');
  await mongoose.connect(uri);

  const apiMongoose = require('../../api/node_modules/mongoose');
  if (apiMongoose !== mongoose && apiMongoose.connection.readyState === 0) {
    await apiMongoose.connect(uri);
  }

  return uri;
}

async function stopTestDb() {
  const mongoose = require('mongoose');
  await mongoose.disconnect().catch(() => {});

  try {
    const apiMongoose = require('../../api/node_modules/mongoose');
    if (apiMongoose !== mongoose) {
      await apiMongoose.disconnect().catch(() => {});
    }
  } catch {}

  if (mongod) await mongod.stop();
}

async function clearCollections() {
  const mongoose = require('mongoose');
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

module.exports = { startTestDb, stopTestDb, clearCollections };

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let RideRequest, Movie, ContentItem;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-immutable';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';

  await mongoose.connect(MONGO_URI);

  RideRequest = require('../api/src/models/RideRequest');
  Movie = require('../api/src/models/Movie');
  ContentItem = require('../api/src/models/ContentItem');
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Immutable Audit Logs — RideRequest state_transitions', () => {
  let ride;

  beforeAll(async () => {
    const userId = new mongoose.Types.ObjectId();
    ride = await RideRequest.create({
      requester: userId,
      pickup_text: 'Start',
      dropoff_text: 'End',
      rider_count: 1,
      time_window_start: new Date(Date.now() + 60000),
      time_window_end: new Date(Date.now() + 360000),
      state_transitions: [{
        from: 'none', to: 'pending_match',
        timestamp: new Date(), actor: userId, reason: 'Created'
      }]
    });
  });

  afterAll(async () => {
    if (ride) await RideRequest.deleteOne({ _id: ride._id });
  });

  test('can append new state transitions', async () => {
    const doc = await RideRequest.findById(ride._id);
    doc.state_transitions.push({
      from: 'pending_match', to: 'accepted',
      timestamp: new Date(), actor: new mongoose.Types.ObjectId(), reason: 'Accepted'
    });
    await doc.save();
    const updated = await RideRequest.findById(ride._id);
    expect(updated.state_transitions.length).toBe(2);
  });

  test('cannot remove state transition entries via save', async () => {
    const doc = await RideRequest.findById(ride._id);
    doc.state_transitions.splice(0, 1); // try to remove first entry
    await expect(doc.save()).rejects.toThrow('IMMUTABLE_LOG');
  });

  test('cannot $pull state transitions via updateOne', async () => {
    await expect(
      RideRequest.updateOne(
        { _id: ride._id },
        { $pull: { state_transitions: { from: 'none' } } }
      )
    ).rejects.toThrow('IMMUTABLE_LOG');
  });
});

describe('Immutable Audit Logs — Movie revisions', () => {
  let movie;

  beforeAll(async () => {
    const userId = new mongoose.Types.ObjectId();
    movie = await Movie.create({
      title: 'Immutable Test Movie ' + Date.now(),
      description: 'Test',
      created_by: userId,
      revisions: [{
        snapshot: { title: 'Immutable Test Movie' },
        changed_by: userId,
        change_type: 'create'
      }]
    });
  });

  afterAll(async () => {
    if (movie) await Movie.deleteOne({ _id: movie._id });
  });

  test('can append new revisions', async () => {
    const doc = await Movie.findById(movie._id);
    doc.revisions.push({
      snapshot: { title: 'Updated Title' },
      changed_by: new mongoose.Types.ObjectId(),
      change_type: 'edit'
    });
    await doc.save();
    const updated = await Movie.findById(movie._id);
    expect(updated.revisions.length).toBe(2);
  });

  test('cannot remove revision entries via save', async () => {
    const doc = await Movie.findById(movie._id);
    doc.revisions.splice(0, 1);
    await expect(doc.save()).rejects.toThrow('IMMUTABLE_LOG');
  });

  test('cannot $pull revisions via updateOne', async () => {
    await expect(
      Movie.updateOne(
        { _id: movie._id },
        { $pull: { revisions: { change_type: 'create' } } }
      )
    ).rejects.toThrow('IMMUTABLE_LOG');
  });
});

describe('Immutable Audit Logs — ContentItem revisions', () => {
  let content;

  beforeAll(async () => {
    const userId = new mongoose.Types.ObjectId();
    content = await ContentItem.create({
      title: 'Immutable Content ' + Date.now(),
      body: 'Test body',
      content_type: 'article',
      author: userId,
      revisions: [{
        snapshot: { title: 'Immutable Content' },
        changed_by: userId,
        change_type: 'create'
      }]
    });
  });

  afterAll(async () => {
    if (content) await ContentItem.deleteOne({ _id: content._id });
  });

  test('can append new revisions', async () => {
    const doc = await ContentItem.findById(content._id);
    doc.revisions.push({
      snapshot: { title: 'Updated' },
      changed_by: new mongoose.Types.ObjectId(),
      change_type: 'edit'
    });
    await doc.save();
    const updated = await ContentItem.findById(content._id);
    expect(updated.revisions.length).toBe(2);
  });

  test('cannot remove revision entries via save', async () => {
    const doc = await ContentItem.findById(content._id);
    doc.revisions.splice(0, 1);
    await expect(doc.save()).rejects.toThrow('IMMUTABLE_LOG');
  });

  test('cannot $pull revisions via updateOne', async () => {
    await expect(
      ContentItem.updateOne(
        { _id: content._id },
        { $pull: { revisions: { change_type: 'create' } } }
      )
    ).rejects.toThrow('IMMUTABLE_LOG');
  });
});

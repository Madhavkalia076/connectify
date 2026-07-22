// These tests hit the real Express app (via Supertest) and the real MongoDB Atlas database
// (same MONGODB_URI from .env the dev server uses) — a deliberate choice for this project over an
// in-memory database, since it's the same "create test data, assert, clean up" pattern already
// used for manual curl testing all through this project, with no extra native dependency to
// install. The tradeoff, stated honestly: these tests need network access and are subject to the
// same occasional Atlas TLS flakiness the dev server has hit during development.
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');

// A distinctive prefix makes it trivial to find and delete every user these tests create,
// without touching anything a human created through the real app.
// Kept short deliberately: the signup route enforces a 20-character max on username, and this
// prefix needs room left over for a distinguishing suffix on each test's username while staying
// under that cap.
const TEST_PREFIX = 'jtauth_';

afterAll(async () => {
  await User.deleteMany({ username: { $regex: `^${TEST_PREFIX}` } });
  // Two separate MongoDB connections need closing, not one: Mongoose's own connection (used by
  // every model), and the session store's independent connection (connect-mongo manages its own
  // MongoClient, unrelated to mongoose.connection). Leaving either open is why Jest would hang
  // after the tests finish instead of exiting cleanly.
  await mongoose.connection.close();
  // connect-mongo kicks off a background "create the sessions TTL index" operation when the store
  // is constructed, tracked by `collectionP`. Closing the client before that finishes throws
  // ("Cannot use a session that has ended") because the in-flight operation loses its connection
  // mid-request — awaiting collectionP first guarantees it's done before close() runs.
  await app.get('sessionStore').collectionP;
  await app.get('sessionStore').close();
});

describe('POST /signup — validation', () => {
  test('rejects a username shorter than 3 characters', async () => {
    const res = await request(app)
      .post('/signup')
      .send({ username: 'ab', password: 'longenoughpass' });

    expect(res.status).toBe(200); // re-renders the signup form, doesn't redirect
    expect(res.text).toContain('Username must be 3-20 characters.');
  });

  test('rejects a username containing invalid characters', async () => {
    const res = await request(app)
      .post('/signup')
      .send({ username: 'bad:name', password: 'longenoughpass' });

    expect(res.text).toContain('Username can only contain letters, numbers, and underscores.');
  });

  test('rejects a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/signup')
      .send({ username: `${TEST_PREFIX}shortpw`, password: 'short' });

    expect(res.text).toContain('Password must be at least 8 characters.');
  });
});

describe('POST /signup and /login — happy path', () => {
  const username = `${TEST_PREFIX}main`;
  const password = 'longenoughpass';

  test('a valid signup creates the user and redirects to /chat', async () => {
    const res = await request(app)
      .post('/signup')
      .send({ username, password });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/chat');

    const saved = await User.findOne({ username });
    expect(saved).not.toBeNull();
    // The whole point of hashing: the stored value must never equal the plaintext password.
    expect(saved.passwordHash).not.toBe(password);
  });

  test('signing up again with the same username is rejected', async () => {
    const res = await request(app)
      .post('/signup')
      .send({ username, password });

    expect(res.text).toContain('That username is already taken.');
  });

  test('logging in with the wrong password is rejected', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username, password: 'wrongpassword' });

    expect(res.text).toContain('Invalid username or password.');
  });

  test('logging in with the correct password redirects to /chat and sets a session cookie', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username, password });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/chat');
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

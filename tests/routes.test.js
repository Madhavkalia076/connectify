// Basic route-response smoke tests — these don't prove the app is "correct" in any deep sense,
// just that a handful of core routing decisions (public page loads, protected pages redirect
// unauthenticated visitors, unknown URLs 404 through the centralized error handler) haven't
// silently regressed.
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');

afterAll(async () => {
  await mongoose.connection.close();
  await app.get('sessionStore').collectionP;
  await app.get('sessionStore').close();
});

test('GET / responds 200 for a visitor with no session', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
});

test('GET /chat redirects to /login when not logged in', async () => {
  const res = await request(app).get('/chat');
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe('/login');
});

test('an unknown route falls through to the 404 error page', async () => {
  const res = await request(app).get('/this-route-does-not-exist');
  expect(res.status).toBe(404);
  expect(res.text).toContain('404');
});

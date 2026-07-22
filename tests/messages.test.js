// Two different levels of "message persistence" are worth testing separately: the model layer
// itself (does Mongoose actually save and read back what we put in?), and the full route/view
// layer (does a logged-in user visiting a room actually see a message that's in the database?).
// A passing model-layer test doesn't prove the route renders it; a passing route test doesn't
// prove *why* it works if the model layer were subtly broken — together they cover more than
// either alone.
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');

const TEST_PREFIX = 'jesttest_msg_';
const roomName = `${TEST_PREFIX}room`;

let testUser;

beforeAll(async () => {
  // Created directly against the model (not through the signup form) with profileComplete: true
  // set up front — this test suite is about message persistence, not the signup flow already
  // covered in auth.test.js, so there's no reason to also walk through profile setup here.
  testUser = await User.create({
    username: `${TEST_PREFIX}user`,
    passwordHash: await bcrypt.hash('longenoughpass', 10),
    displayName: 'Jest Test User',
    profileComplete: true,
  });
  await Room.create({ name: roomName, createdBy: testUser.username, requiresApproval: false });
});

afterAll(async () => {
  await Message.deleteMany({ roomId: roomName });
  await Room.deleteOne({ name: roomName });
  await User.deleteMany({ username: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.connection.close();
  await app.get('sessionStore').collectionP;
  await app.get('sessionStore').close();
});

test('a saved message can be read back with the same text and room', async () => {
  const saved = await Message.create({
    username: testUser.username,
    roomId: roomName,
    text: 'hello from the model layer',
  });

  const found = await Message.findById(saved._id);
  expect(found.text).toBe('hello from the model layer');
  expect(found.roomId).toBe(roomName);
});

test('an existing message shows up when a logged-in user loads the room', async () => {
  await Message.create({
    username: testUser.username,
    roomId: roomName,
    text: 'a message the route test should find',
  });

  // supertest's `.agent()` (not the plain `request()` used elsewhere) remembers cookies between
  // calls on the same agent instance — needed here specifically because logging in sets a session
  // cookie that the following GET /chat/:roomId request must send back to be recognized as
  // "logged in."
  const agent = request.agent(app);
  await agent.post('/login').send({ username: testUser.username, password: 'longenoughpass' });

  const res = await agent.get(`/chat/${roomName}`);
  expect(res.status).toBe(200);
  expect(res.text).toContain('a message the route test should find');
});

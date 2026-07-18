const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const Room = require('../models/Room');
const Message = require('../models/Message');

// Only letters, numbers, hyphens, underscores — keeps room names safe to put straight into a URL
// without needing to think about encoding, and stops someone naming a room "../../etc".
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{2,30}$/;

router.get('/chat', requireAuth, async (req, res) => {
  const rooms = await Room.find().sort({ createdAt: -1 });
  res.render('rooms', { rooms, error: null, username: req.session.username });
});

router.post('/chat/rooms', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();

  if (!ROOM_NAME_PATTERN.test(name)) {
    const rooms = await Room.find().sort({ createdAt: -1 });
    return res.render('rooms', {
      rooms,
      username: req.session.username,
      error: 'Room names must be 2-30 characters: letters, numbers, - or _ only.',
    });
  }

  const existing = await Room.findOne({ name });
  if (!existing) {
    await Room.create({ name, createdBy: req.session.username });
  }

  res.redirect(`/chat/${name}`);
});

router.get('/chat/:roomId', requireAuth, async (req, res) => {
  const room = await Room.findOne({ name: req.params.roomId });
  if (!room) {
    return res.redirect('/chat');
  }

  // Fetch the most recent 50 messages, newest first (so .limit() grabs the right ones),
  // then reverse to chronological order for rendering top-to-bottom like a normal chat log.
  const recentMessages = await Message.find({ roomId: room.name })
    .sort({ createdAt: -1 })
    .limit(50);
  const messages = recentMessages.reverse();

  res.render('chat', {
    room: room.name,
    username: req.session.username,
    messages,
  });
});

module.exports = router;

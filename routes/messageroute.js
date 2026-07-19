const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const Message = require('../models/Message');

router.post('/messages/:messageId/delete-for-me', requireAuth, async (req, res) => {
  const message = await Message.findById(req.params.messageId).catch(() => null);
  if (!message) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  // No authorization check beyond "logged in" — hiding a message from your own view can never
  // affect anyone else, so there's nothing to protect here the way room/message-for-everyone
  // deletion needs to be.
  if (!message.deletedFor.includes(req.session.username)) {
    message.deletedFor.push(req.session.username);
    await message.save();
  }

  res.json({ ok: true });
});

router.post('/messages/:messageId/delete-for-everyone', requireAuth, async (req, res) => {
  const message = await Message.findById(req.params.messageId).catch(() => null);
  if (!message) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  // Same authorization pattern used everywhere else in this app: only the person who sent the
  // message can delete it for everyone. Without this, anyone could erase anyone else's messages
  // just by knowing the message ID.
  if (message.username !== req.session.username) {
    return res.status(403).json({ error: 'You can only delete your own messages for everyone.' });
  }

  message.deletedForEveryone = true;
  await message.save();

  // Broadcast so everyone currently viewing the room sees the placeholder appear immediately,
  // not just whoever reloads the page next.
  req.app.get('io').to(message.roomId).emit('messageDeleted', { id: message._id.toString() });

  res.json({ ok: true });
});

module.exports = router;

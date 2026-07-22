const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireProfile = require('../middleware/requireProfile');
const upload = require('../lib/upload');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { getDmRoomId } = require('../lib/dm');
const { getSidebarData } = require('../lib/sidebarData');
const catchAsync = require('../middleware/catchAsync');

// Escapes regex special characters in user input before it's used to build a $regex query —
// without this, someone typing something like "a.*" or "(" into the search box would be
// constructing part of an actual regular expression, not searching for that literal text.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Live "type a name, see matches" search for starting a new DM. Matches against *either*
// username or displayName — someone searching only knows what they see, and displayName is what
// shows everywhere in this app (sidebar, message labels, profiles); requiring the literal login
// username would mean a person who only knows someone's shown name could never find them.
// Case-insensitive substring match, capped at 10 results — this app's user base is small enough
// that a simple regex query is plenty; a dedicated search index would be solving a problem that
// doesn't exist yet here.
router.get('/dm/search', requireAuth, catchAsync(async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json([]);
  }
  const escaped = escapeRegex(query);
  const users = await User.find({
    username: { $ne: req.session.username }, // never suggest DMing yourself
    $or: [
      { username: { $regex: escaped, $options: 'i' } },
      { displayName: { $regex: escaped, $options: 'i' } },
    ],
  }).limit(10);
  res.json(users.map((u) => ({
    username: u.username,
    displayName: u.displayName,
    profilePicture: u.profilePicture,
  })));
}));

router.post('/dm/start', requireAuth, catchAsync(async (req, res) => {
  const targetUsername = (req.body.username || '').trim();

  if (!targetUsername || targetUsername === req.session.username) {
    return res.redirect('/chat');
  }

  const targetUser = await User.findOne({ username: targetUsername });
  if (!targetUser) {
    return res.redirect('/chat');
  }

  const participants = [req.session.username, targetUsername].sort();
  const existing = await Conversation.findOne({ participants });
  if (!existing) {
    await Conversation.create({ participants });
  }

  res.redirect(`/dm/${targetUsername}`);
}));

router.get('/dm/:username', requireAuth, requireProfile, catchAsync(async (req, res) => {
  const targetUsername = req.params.username;
  const myUsername = req.session.username;

  if (targetUsername === myUsername) {
    return res.redirect('/chat');
  }

  const targetUser = await User.findOne({ username: targetUsername });
  if (!targetUser) {
    return res.redirect('/chat');
  }

  const participants = [myUsername, targetUsername].sort();
  let conversation = await Conversation.findOne({ participants });
  if (!conversation) {
    // Visiting the URL directly (e.g. a bookmark, or the search result before ever "starting" the
    // conversation via the form) should still work — create it on the fly rather than 404ing.
    conversation = await Conversation.create({ participants });
  }

  const roomId = getDmRoomId(myUsername, targetUsername);

  const recentMessages = await Message.find({ roomId })
    .sort({ createdAt: -1 })
    .limit(50);
  const messages = recentMessages
    .filter((msg) => !msg.deletedFor.includes(myUsername))
    .reverse();

  // Mark this conversation read *before* computing unread counts below, same reasoning as room
  // chat — otherwise its own sidebar entry would show a stale count on this exact page load.
  const { user } = await getSidebarData(myUsername);
  user.lastRead.set(roomId, new Date());
  await user.save();
  const { rooms, conversations, unreadCounts, dmPartnerProfiles, myDisplayName, myProfilePicture } = await getSidebarData(myUsername);

  const onlineUsers = req.app.get('getOnlineUsers')(roomId);

  res.render('dm', {
    username: myUsername,
    partnerUsername: targetUsername,
    partnerDisplayName: targetUser.displayName,
    partnerProfilePicture: targetUser.profilePicture,
    roomId,
    messages,
    partnerOnline: onlineUsers.includes(targetUsername),
    rooms,
    conversations,
    dmPartnerProfiles,
    myDisplayName,
    myProfilePicture,
    unreadCounts,
  });
}));

router.post('/dm/:username/upload', requireAuth, function (req, res, next) {
  upload.single('image')(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image was uploaded.' });
    }

    try {
      const myUsername = req.session.username;
      const targetUsername = req.params.username;
      const targetUser = await User.findOne({ username: targetUsername });
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const roomId = getDmRoomId(myUsername, targetUsername);
      const fileUrl = `/uploads/${req.file.filename}`;
      const saved = await Message.create({
        username: myUsername,
        roomId,
        type: 'image',
        fileUrl,
      });

      await Conversation.updateOne(
        { participants: [myUsername, targetUsername].sort() },
        { $currentDate: { updatedAt: true } }
      );

      req.app.get('io').to(roomId).emit('message', {
        id: saved._id.toString(),
        username: saved.username,
        type: 'image',
        fileUrl: saved.fileUrl,
        room: roomId,
      });

      res.json({ ok: true });
    } catch (err2) {
      next(err2);
    }
  });
});

module.exports = router;

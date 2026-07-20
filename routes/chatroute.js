const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const requireAuth = require('../middleware/requireAuth');
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');

// Only letters, numbers, hyphens, underscores — keeps room names safe to put straight into a URL
// without needing to think about encoding, and stops someone naming a room "../../etc".
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{2,30}$/;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — generous enough for a photo, small enough that
                                            // one user can't fill up free-tier disk space quickly

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '../uploads'),
    filename: (req, file, cb) => {
      // Never trust the original filename directly (it's attacker-controlled input — could
      // contain path traversal characters, collide with another upload, or just be unsafe to put
      // straight into a URL). Generate our own unique name, keep only the file extension.
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    // Checking the browser-supplied MIME type isn't a hard security guarantee (it can be spoofed),
    // but it's a reasonable first filter — real content-type enforcement would need to inspect the
    // file's actual bytes, which is more than this project's scope needs. Unrestricted file upload
    // is a classic vulnerability class (e.g. uploading a disguised executable) — this is the basic
    // mitigation: only accept a small allowlist of known-safe image types, nothing else.
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, GIF, or WEBP images are allowed.'));
    }
    cb(null, true);
  },
});

// Unread badge count per room = messages sent by *someone else* after this user's last visit to
// that room. `user.lastRead` only has entries for rooms actually visited before, so a room never
// opened defaults to the epoch (i.e. everything in it counts as unread) via `|| new Date(0)`.
//
// Only computed for rooms the user can actually read — an approval-required room they were never
// approved for is still listed in the sidebar (so they can request to join it), but showing an
// unread count for it would leak "this private room has activity" to someone not allowed to see
// the messages themselves.
async function computeUnreadCounts(rooms, user) {
  const accessibleRooms = rooms.filter((room) => (
    !room.requiresApproval || room.createdBy === user.username || room.members.includes(user.username)
  ));
  const entries = await Promise.all(accessibleRooms.map(async (room) => {
    const lastRead = user.lastRead.get(room.name) || new Date(0);
    const count = await Message.countDocuments({
      roomId: room.name,
      username: { $ne: user.username },
      createdAt: { $gt: lastRead },
    });
    return [room.name, count];
  }));
  return Object.fromEntries(entries);
}

router.get('/chat', requireAuth, async (req, res) => {
  const rooms = await Room.find().sort({ createdAt: -1 });
  const user = await User.findOne({ username: req.session.username });
  const unreadCounts = await computeUnreadCounts(rooms, user);
  res.render('rooms', { rooms, roomError: null, username: req.session.username, unreadCounts });
});

router.post('/chat/rooms', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  // Checkbox inputs only appear in req.body at all when checked — unchecked means the field is
  // simply absent, not present-and-false. Coercing with !! handles both cases explicitly.
  const requiresApproval = !!req.body.requiresApproval;

  if (!ROOM_NAME_PATTERN.test(name)) {
    const rooms = await Room.find().sort({ createdAt: -1 });
    return res.render('rooms', {
      rooms,
      username: req.session.username,
      roomError: 'Room names must be 2-30 characters: letters, numbers, - or _ only.',
    });
  }

  const existing = await Room.findOne({ name });
  if (!existing) {
    // The creator is auto-approved as the room's first member — otherwise they'd need to request
    // to join a room they just made, which makes no sense for an approval-required room.
    await Room.create({ name, createdBy: req.session.username, requiresApproval, members: [req.session.username] });
  }

  res.redirect(`/chat/${name}`);
});

router.get('/chat/:roomId', requireAuth, async (req, res) => {
  const room = await Room.findOne({ name: req.params.roomId });
  if (!room) {
    return res.redirect('/chat');
  }

  const isOwner = room.createdBy === req.session.username;
  const isMember = room.members.includes(req.session.username);

  const rooms = await Room.find().sort({ createdAt: -1 });
  const user = await User.findOne({ username: req.session.username });

  // Approval-required rooms have three states for a non-owner visitor: already a member (show the
  // chat), already requested and waiting, or never requested (show a "request to join" screen).
  // Open rooms skip all of this entirely and behave exactly as before.
  if (room.requiresApproval && !isOwner && !isMember) {
    const isPending = room.pendingRequests.includes(req.session.username);
    const unreadCounts = await computeUnreadCounts(rooms, user);
    return res.render('room-access', {
      room: room.name,
      username: req.session.username,
      isPending,
      rooms,
      activeRoom: room.name,
      unreadCounts,
    });
  }

  // Mark this room read *before* computing unread counts below, so its own sidebar entry shows
  // zero on this page load rather than whatever it was right before this visit.
  user.lastRead.set(room.name, new Date());
  await user.save();
  const unreadCounts = await computeUnreadCounts(rooms, user);

  // Fetch the most recent 50 messages, newest first (so .limit() grabs the right ones),
  // then reverse to chronological order for rendering top-to-bottom like a normal chat log.
  const recentMessages = await Message.find({ roomId: room.name })
    .sort({ createdAt: -1 })
    .limit(50);
  // Messages this user deleted "for me" never render at all for them — filtered out after the
  // fetch, not in the query itself, so this is a known small simplification: if someone had
  // hidden several of the most recent 50, they'd see fewer than 50 messages rather than the
  // filter reaching further back to backfill. Not worth the extra query complexity at this scale.
  const messages = recentMessages
    .filter((msg) => !msg.deletedFor.includes(req.session.username))
    .reverse();

  // "Participants" means something different depending on the room type: approval-required rooms
  // have a real, persistent member list (so we show everyone, with a live online/offline dot);
  // open rooms never track membership at all, so the only honest answer for "who's here" is
  // whoever's actually connected right now.
  const onlineUsers = req.app.get('getOnlineUsers')(room.name);
  const participants = room.requiresApproval
    ? room.members.map((name) => ({ username: name, online: onlineUsers.includes(name) }))
    : onlineUsers.map((name) => ({ username: name, online: true }));

  res.render('chat', {
    room: room.name,
    username: req.session.username,
    messages,
    // the view uses this to decide whether to show a "Delete Room" button at all —
    // requireAuth already proved *who* you are, this is the separate check for *what
    // you're allowed to do*
    isOwner,
    roomOwner: room.createdBy,
    requiresApproval: room.requiresApproval,
    pendingRequests: isOwner ? room.pendingRequests : [],
    description: room.description,
    imageUrl: room.imageUrl,
    participants,
    rooms,
    activeRoom: room.name,
    unreadCounts,
  });
});

router.post('/chat/:roomId/request', requireAuth, async (req, res) => {
  const room = await Room.findOne({ name: req.params.roomId });
  if (!room) {
    return res.redirect('/chat');
  }

  const username = req.session.username;
  const alreadyMember = room.members.includes(username);
  const alreadyPending = room.pendingRequests.includes(username);

  if (!alreadyMember && !alreadyPending) {
    room.pendingRequests.push(username);
    await room.save();
  }

  res.redirect(`/chat/${room.name}`);
});

router.post('/chat/:roomId/approve', requireAuth, async (req, res) => {
  const room = await Room.findOne({ name: req.params.roomId });
  if (!room) {
    return res.redirect('/chat');
  }

  // Same authorization pattern as room deletion: only the owner can approve requests to join
  // *their* room.
  if (room.createdBy !== req.session.username) {
    return res.status(403).send('Only the room owner can approve join requests.');
  }

  const requestedUsername = req.body.username;
  room.pendingRequests = room.pendingRequests.filter((u) => u !== requestedUsername);
  if (!room.members.includes(requestedUsername)) {
    room.members.push(requestedUsername);
  }
  await room.save();

  res.redirect(`/chat/${room.name}`);
});

router.post('/chat/:roomId/reject', requireAuth, async (req, res) => {
  const room = await Room.findOne({ name: req.params.roomId });
  if (!room) {
    return res.redirect('/chat');
  }

  if (room.createdBy !== req.session.username) {
    return res.status(403).send('Only the room owner can reject join requests.');
  }

  const requestedUsername = req.body.username;
  room.pendingRequests = room.pendingRequests.filter((u) => u !== requestedUsername);
  await room.save();

  res.redirect(`/chat/${room.name}`);
});

router.post('/chat/:roomId/leave', requireAuth, async (req, res) => {
  const room = await Room.findOne({ name: req.params.roomId });
  if (!room) {
    return res.redirect('/chat');
  }

  // Only approval-required rooms track membership at all — leaving an open room is meaningless
  // (there's no membership record to remove; visiting the URL again re-enters instantly). Also
  // deliberately not letting the owner leave via this route: their membership is tied to
  // ownership, and "the owner leaves" raises a question (who owns the room now?) this feature
  // isn't trying to answer — they'd delete the room instead if they want to be done with it.
  if (room.requiresApproval && room.createdBy !== req.session.username) {
    room.members = room.members.filter((u) => u !== req.session.username);
    await room.save();
  }

  res.redirect('/chat');
});

router.post('/chat/:roomId/settings', requireAuth, function (req, res) {
  upload.single('image')(req, res, async function (err) {
    if (err) {
      return res.status(400).send(err.message);
    }

    const room = await Room.findOne({ name: req.params.roomId });
    if (!room) {
      return res.redirect('/chat');
    }

    // Same authorization pattern as everything else owner-only: authentication (requireAuth)
    // only proves someone is logged in, this proves they're allowed to change *this* room.
    if (room.createdBy !== req.session.username) {
      return res.status(403).send('Only the room owner can change room settings.');
    }

    if (typeof req.body.description === 'string') {
      room.description = req.body.description.trim().slice(0, 200);
    }
    if (req.file) {
      room.imageUrl = `/uploads/${req.file.filename}`;
    }
    await room.save();

    // Known limitation, scoped out deliberately: this doesn't broadcast live to anyone else
    // currently viewing the room — they'll see the updated description/image next time they
    // load the page, not instantly. Real-time room-metadata sync would need its own socket event,
    // and wasn't worth the added complexity alongside everything else in this pass.
    res.redirect(`/chat/${room.name}`);
  });
});

router.post('/chat/:roomId/upload', requireAuth, function (req, res) {
  // Wrapping upload.single() in a plain function (instead of passing it directly as middleware)
  // lets us catch its errors ourselves — multer reports "file too big" / "wrong file type" via an
  // error passed to this callback, not a normal Express error-handling middleware chain, since
  // there isn't a centralized error handler wired up yet (that's a later phase).
  upload.single('image')(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const room = await Room.findOne({ name: req.params.roomId });
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image was uploaded.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const saved = await Message.create({
      username: req.session.username,
      roomId: room.name,
      type: 'image',
      fileUrl,
    });

    // Same "save first, then broadcast live" pattern as text messages — everyone in the room,
    // sender included, gets it from the same socket event the chat page already listens to.
    req.app.get('io').to(room.name).emit('message', {
      id: saved._id.toString(),
      username: saved.username,
      type: 'image',
      fileUrl: saved.fileUrl,
      room: room.name,
    });

    res.json({ ok: true });
  });
});

router.post('/chat/:roomId/delete', requireAuth, async (req, res) => {
  const room = await Room.findOne({ name: req.params.roomId });
  if (!room) {
    return res.redirect('/chat');
  }

  // Authentication (requireAuth) only proved someone is logged in. This is the authorization
  // check: being logged in doesn't mean you're allowed to delete *this specific* room — only
  // its creator is. Without this check, any logged-in user could delete any room by just
  // knowing/guessing its URL.
  if (room.createdBy !== req.session.username) {
    return res.status(403).send('Only the room creator can delete this room.');
  }

  // Hard delete: the room and its messages are actually removed, not just hidden. Fine for this
  // scope (a chat room isn't the kind of thing users expect to "undo" deleting), but worth knowing
  // production systems often prefer a soft delete (a `deletedAt` flag, data kept but hidden) for
  // anything a user might regret removing.
  await Message.deleteMany({ roomId: room.name });
  await Room.deleteOne({ _id: room._id });

  res.redirect('/chat');
});

module.exports = router;

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireProfile = require('../middleware/requireProfile');
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');
const upload = require('../lib/upload');
const { getSidebarData } = require('../lib/sidebarData');

// Only letters, numbers, hyphens, underscores — keeps room names safe to put straight into a URL
// without needing to think about encoding, and stops someone naming a room "../../etc".
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{2,30}$/;

router.get('/chat', requireAuth, requireProfile, async (req, res) => {
  const { rooms, conversations, unreadCounts, dmPartnerProfiles, myDisplayName, myProfilePicture } = await getSidebarData(req.session.username);
  res.render('rooms', { rooms, conversations, dmPartnerProfiles, myDisplayName, myProfilePicture, roomError: null, username: req.session.username, unreadCounts });
});

router.post('/chat/rooms', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  // Checkbox inputs only appear in req.body at all when checked — unchecked means the field is
  // simply absent, not present-and-false. Coercing with !! handles both cases explicitly.
  const requiresApproval = !!req.body.requiresApproval;

  if (!ROOM_NAME_PATTERN.test(name)) {
    const { rooms, conversations, unreadCounts, dmPartnerProfiles, myDisplayName, myProfilePicture } = await getSidebarData(req.session.username);
    return res.render('rooms', {
      rooms,
      conversations,
      unreadCounts,
      dmPartnerProfiles,
      myDisplayName,
      myProfilePicture,
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

router.get('/chat/:roomId', requireAuth, requireProfile, async (req, res) => {
  const room = await Room.findOne({ name: req.params.roomId });
  if (!room) {
    return res.redirect('/chat');
  }

  const isOwner = room.createdBy === req.session.username;
  const isMember = room.members.includes(req.session.username);

  const { rooms, conversations, user, unreadCounts: sidebarUnread, dmPartnerProfiles, myDisplayName, myProfilePicture } = await getSidebarData(req.session.username);

  // Approval-required rooms have three states for a non-owner visitor: already a member (show the
  // chat), already requested and waiting, or never requested (show a "request to join" screen).
  // Open rooms skip all of this entirely and behave exactly as before.
  if (room.requiresApproval && !isOwner && !isMember) {
    const isPending = room.pendingRequests.includes(req.session.username);
    return res.render('room-access', {
      room: room.name,
      username: req.session.username,
      isPending,
      rooms,
      conversations,
      dmPartnerProfiles,
      myDisplayName,
      myProfilePicture,
      activeRoom: room.name,
      unreadCounts: sidebarUnread,
    });
  }

  // Mark this room read *before* recomputing unread counts, so its own sidebar entry shows zero
  // on this page load rather than whatever it was right before this visit.
  user.lastRead.set(room.name, new Date());
  await user.save();
  const { unreadCounts } = await getSidebarData(req.session.username);

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
  const participantUsernames = room.requiresApproval ? room.members : onlineUsers;
  const participantProfiles = await User.find({ username: { $in: participantUsernames } });
  const participantProfileMap = Object.fromEntries(
    participantProfiles.map((u) => [u.username, { displayName: u.displayName, profilePicture: u.profilePicture }])
  );
  const participants = participantUsernames.map((name) => ({
    username: name,
    online: onlineUsers.includes(name),
    displayName: participantProfileMap[name]?.displayName,
    profilePicture: participantProfileMap[name]?.profilePicture,
  }));

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
    conversations,
    dmPartnerProfiles,
    myDisplayName,
    myProfilePicture,
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

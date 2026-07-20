const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireProfile = require('../middleware/requireProfile');
const upload = require('../lib/upload');
const User = require('../models/User');
const { getSidebarData } = require('../lib/sidebarData');

// Deliberately only requireAuth here, not requireProfile — this route IS the way out of the
// "profile incomplete" redirect loop, so it can't also require a complete profile to reach it.
router.get('/profile/setup', requireAuth, (req, res) => {
  res.render('profile-setup', { error: null });
});

router.post('/profile/setup', requireAuth, function (req, res) {
  upload.single('image')(req, res, async function (err) {
    if (err) {
      return res.render('profile-setup', { error: err.message });
    }

    const displayName = (req.body.displayName || '').trim();
    if (!displayName) {
      return res.render('profile-setup', { error: 'A display name is required.' });
    }

    const user = await User.findOne({ username: req.session.username });
    user.displayName = displayName;
    user.bio = (req.body.bio || '').trim().slice(0, 150);
    if (req.file) {
      user.profilePicture = `/uploads/${req.file.filename}`;
    }
    user.profileComplete = true;
    await user.save();

    // Keep the session's copy in sync immediately — requireProfile reads from here, not the
    // database, so without this the very next page load would bounce right back to this form.
    req.session.profileComplete = true;

    res.redirect('/chat');
  });
});

// Editing (after onboarding is already done) lives inside the normal sidebar shell — unlike
// /profile/setup, which stays a standalone page since it's specifically the one place someone
// with an incomplete profile is allowed to be.
router.get('/profile/edit', requireAuth, requireProfile, async (req, res) => {
  const sidebar = await getSidebarData(req.session.username);
  res.render('profile-edit', {
    username: req.session.username,
    bio: sidebar.user.bio,
    profilePicture: sidebar.user.profilePicture,
    displayName: sidebar.myDisplayName,
    error: null,
    rooms: sidebar.rooms,
    conversations: sidebar.conversations,
    unreadCounts: sidebar.unreadCounts,
    dmPartnerProfiles: sidebar.dmPartnerProfiles,
    myDisplayName: sidebar.myDisplayName,
    myProfilePicture: sidebar.myProfilePicture,
  });
});

router.post('/profile/edit', requireAuth, requireProfile, function (req, res) {
  upload.single('image')(req, res, async function (err) {
    const sidebar = await getSidebarData(req.session.username);
    const shellData = {
      username: req.session.username,
      rooms: sidebar.rooms,
      conversations: sidebar.conversations,
      unreadCounts: sidebar.unreadCounts,
      dmPartnerProfiles: sidebar.dmPartnerProfiles,
      myDisplayName: sidebar.myDisplayName,
      myProfilePicture: sidebar.myProfilePicture,
    };

    if (err) {
      return res.render('profile-edit', { ...shellData, bio: sidebar.user.bio, profilePicture: sidebar.user.profilePicture, displayName: sidebar.myDisplayName, error: err.message });
    }

    const displayName = (req.body.displayName || '').trim();
    if (!displayName) {
      return res.render('profile-edit', { ...shellData, bio: sidebar.user.bio, profilePicture: sidebar.user.profilePicture, displayName: sidebar.myDisplayName, error: 'A display name is required.' });
    }

    sidebar.user.displayName = displayName;
    sidebar.user.bio = (req.body.bio || '').trim().slice(0, 150);
    if (req.file) {
      sidebar.user.profilePicture = `/uploads/${req.file.filename}`;
    }
    await sidebar.user.save();

    res.redirect(`/profile/${req.session.username}`);
  });
});

// Viewing any user's profile, including your own — a real username in the URL, not a special
// "/profile/me" case, keeps this one route doing both jobs (visiting your own profile just means
// the target happens to match the logged-in user).
router.get('/profile/:username', requireAuth, requireProfile, async (req, res) => {
  const targetUser = await User.findOne({ username: req.params.username });
  if (!targetUser) {
    return res.redirect('/chat');
  }

  const sidebar = await getSidebarData(req.session.username);

  res.render('profile-view', {
    username: req.session.username,
    isOwnProfile: req.session.username === targetUser.username,
    profileUsername: targetUser.username,
    profileDisplayName: targetUser.displayName,
    profileBio: targetUser.bio,
    profilePicture: targetUser.profilePicture,
    rooms: sidebar.rooms,
    conversations: sidebar.conversations,
    unreadCounts: sidebar.unreadCounts,
    dmPartnerProfiles: sidebar.dmPartnerProfiles,
    myDisplayName: sidebar.myDisplayName,
    myProfilePicture: sidebar.myProfilePicture,
  });
});

module.exports = router;

const Room = require('../models/Room');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { computeRoomUnreadCounts, computeDmUnreadCounts } = require('./unread');

// Every page that renders partials/sidebar.ejs needs the same handful of things: the room list,
// the user's DM threads, and unread counts across both. Centralized here so each route doesn't
// re-derive this independently and risk drifting out of sync with each other.
async function getSidebarData(username) {
  const [rooms, conversations, user] = await Promise.all([
    Room.find().sort({ createdAt: -1 }),
    Conversation.find({ participants: username }).sort({ updatedAt: -1 }),
    User.findOne({ username }),
  ]);

  const [roomUnread, dmUnread] = await Promise.all([
    computeRoomUnreadCounts(rooms, user),
    computeDmUnreadCounts(conversations, user),
  ]);

  // The sidebar's DM list shows each conversation partner's display name/picture, not their raw
  // username — a small batch lookup here (fetched once, all partners at once) rather than the
  // template needing to query per row.
  const partnerUsernames = conversations.map((conv) => conv.participants.find((p) => p !== username));
  const partnerUsers = await User.find({ username: { $in: partnerUsernames } });
  const dmPartnerProfiles = Object.fromEntries(
    partnerUsers.map((u) => [u.username, { displayName: u.displayName, profilePicture: u.profilePicture }])
  );

  return {
    rooms,
    conversations,
    user,
    unreadCounts: { ...roomUnread, ...dmUnread },
    dmPartnerProfiles,
    // Exposed directly (rather than every call site reaching into `user.displayName` itself) since
    // literally every route that renders the sidebar needs these for its own footer.
    myDisplayName: user.displayName,
    myProfilePicture: user.profilePicture,
  };
}

module.exports = { getSidebarData };

const Message = require('../models/Message');
const { getDmRoomId } = require('./dm');

// Unread badge count per room = messages sent by *someone else* after this user's last visit to
// that room. `user.lastRead` only has entries for rooms actually visited before, so a room never
// opened defaults to the epoch (i.e. everything in it counts as unread) via `|| new Date(0)`.
//
// Only computed for rooms the user can actually read — an approval-required room they were never
// approved for is still listed in the sidebar (so they can request to join it), but showing an
// unread count for it would leak "this private room has activity" to someone not allowed to see
// the messages themselves.
async function computeRoomUnreadCounts(rooms, user) {
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

// Same idea, for DM threads — every conversation the user is a participant in is, by definition,
// one they're allowed to read, so there's no accessibility filter needed here the way there is
// for rooms.
async function computeDmUnreadCounts(conversations, user) {
  const entries = await Promise.all(conversations.map(async (conversation) => {
    const roomId = getDmRoomId(conversation.participants[0], conversation.participants[1]);
    const lastRead = user.lastRead.get(roomId) || new Date(0);
    const count = await Message.countDocuments({
      roomId,
      username: { $ne: user.username },
      createdAt: { $gt: lastRead },
    });
    return [roomId, count];
  }));
  return Object.fromEntries(entries);
}

module.exports = { computeRoomUnreadCounts, computeDmUnreadCounts };

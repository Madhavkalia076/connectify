// A DM's roomId is derived, not stored anywhere — sorting the two usernames means it's the exact
// same string regardless of who opens the conversation first ("dm:alice:bob", never "dm:bob:alice").
// Prefixed with "dm:" so it can never collide with a real room name (room names are restricted to
// letters/numbers/-/_ at creation, so they can never contain a colon).
function getDmRoomId(usernameA, usernameB) {
  return 'dm:' + [usernameA, usernameB].sort().join(':');
}

function isDmRoomId(roomId) {
  return roomId.startsWith('dm:');
}

// Pulls the two usernames back out of a roomId string — used by the socket-level access check,
// which needs to answer "is this user allowed in this DM" without a database round-trip.
function getDmParticipants(roomId) {
  return roomId.slice(3).split(':');
}

module.exports = { getDmRoomId, isDmRoomId, getDmParticipants };

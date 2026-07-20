const mongoose = require('mongoose');

// This is the "shape" we're telling MongoDB to expect for every document in the "users" collection.
// MongoDB itself doesn't require this — Mongoose enforces it for us on the way in.
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,   // Mongoose creates a unique index — two users can't share a username
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true, // never store the raw password — only the bcrypt hash of it
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Per-room "last read" timestamps — a Mongoose Map, keyed by room name, valued by when this
  // user last actually looked at that room. Unread badges are computed by comparing this against
  // message timestamps: anything newer than lastRead[room] (and not sent by this user) is unread.
  lastRead: {
    type: Map,
    of: Date,
    default: {},
  },
});

module.exports = mongoose.model('User', userSchema);

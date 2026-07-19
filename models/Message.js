const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  roomId: {
    type: String,
    required: true, // which room/pairing this message belongs to (used to filter history later)
  },
  type: {
    type: String,
    enum: ['text', 'image'],
    default: 'text',
  },
  text: {
    type: String,
    // required only for text messages — an image message can have empty text (no caption).
    // Mongoose supports a conditional required function for exactly this case.
    required: function () { return this.type === 'text'; },
    default: '',
  },
  fileUrl: {
    type: String, // set only when type === 'image' — the /uploads/<filename> path to fetch it from
  },
  // "Delete for everyone": the message row is kept (soft delete, same reasoning as room deletion —
  // consistent with a real chat app's undo-adjacent expectations), just marked and shown as a
  // placeholder to everyone from then on. Only the original sender is allowed to set this.
  deletedForEveryone: {
    type: Boolean,
    default: false,
  },
  // "Delete for me": a list of usernames who've individually hidden this message from their own
  // view. Anyone can add themselves here for any message — it only ever affects their own screen,
  // so there's no authorization check needed beyond "are you logged in."
  deletedFor: {
    type: [String],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Message', messageSchema);

const mongoose = require('mongoose');

// A DM thread between exactly two people. This exists mainly so a conversation can be listed in
// the sidebar (and opened) even before either person has sent a single message — otherwise
// there'd be nothing to show until the first message landed.
//
// The messages themselves don't live here — they're plain Message documents, same model and same
// Socket.io "message" event as room chat, just with a synthetic roomId ("dm:alice:bob", usernames
// sorted alphabetically so it's the same string no matter who opens the conversation first). That
// reuse is deliberate: typing, presence, unread badges, image sharing, and even video calling all
// already work for "a roomId two people are in" — a DM doesn't need any of that rebuilt.
const conversationSchema = new mongoose.Schema({
  participants: {
    type: [String],
    required: true,
    validate: {
      validator: (arr) => arr.length === 2,
      message: 'A conversation must have exactly 2 participants.',
    },
  },
}, { timestamps: true }); // updatedAt is touched whenever a message is sent, for "most recent
                            // conversation first" ordering in the sidebar — see app.js.

module.exports = mongoose.model('Conversation', conversationSchema);

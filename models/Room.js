const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  createdBy: {
    type: String, // username of whoever created it — plain string, not a User reference,
                   // since we don't need to query "all rooms by this user" anywhere yet
  },
  requiresApproval: {
    type: Boolean,
    default: false, // an "open" room — anyone logged in can join immediately, no gating
  },
  // Only meaningfully enforced when requiresApproval is true. Open rooms don't bother maintaining
  // this — every visit would otherwise be an extra database write for no functional benefit.
  members: {
    type: [String],
    default: [],
  },
  pendingRequests: {
    type: [String],
    default: [],
  },
  description: {
    type: String,
    default: '',
    maxlength: 200,
  },
  imageUrl: {
    type: String, // set only once the owner uploads one — falls back to the "#" icon in the UI
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Room', roomSchema);

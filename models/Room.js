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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Room', roomSchema);

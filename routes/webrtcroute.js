const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');

// TURN credentials used to sit directly in the server-rendered HTML of chat.ejs/dm.ejs — anyone
// who right-clicked "View Page Source" while logged in could read them straight off the page.
// Moving them behind an authenticated fetch() call doesn't make them secret (a determined person
// can still open devtools' Network tab and see the response), but it raises the bar from "sitting
// in plain sight" to "requires actively inspecting network traffic while logged in," and it means
// the credentials only ever go out when a call is actually about to start, not on every page load.
// A stronger fix — short-lived, per-call credentials minted via Metered's TURN REST API, so a
// captured credential expires within minutes instead of staying valid indefinitely — is a real
// next step if this ever needs to be more than "good enough for a free-tier portfolio demo."
router.get('/webrtc/ice-servers', requireAuth, (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ];

  if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    const username = process.env.TURN_USERNAME;
    const credential = process.env.TURN_CREDENTIAL;
    iceServers.push(
      { urls: 'turn:global.relay.metered.ca:80', username, credential },
      { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential },
      { urls: 'turn:global.relay.metered.ca:443', username, credential },
      { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential },
    );
  }

  res.json({ iceServers });
});

module.exports = router;

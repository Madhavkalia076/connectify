// Route guard: blocks access to chat/DMs until the user has completed their profile (display
// name, at minimum). Always run *after* requireAuth — this only checks a flag that requireAuth's
// own check (req.session.userId) has to already exist for.
//
// Reads from the session instead of querying the User collection on every request — the session
// value is kept in sync at login/signup and again the moment profile setup is actually completed
// (see routes/profileroute.js), so it never needs a fresh database round-trip just to render a page.
module.exports = function requireProfile(req, res, next) {
  if (!req.session.profileComplete) {
    return res.redirect('/profile/setup');
  }
  next();
};

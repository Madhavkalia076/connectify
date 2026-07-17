// Route guard: blocks access to a page unless req.session.userId was set by a successful login.
// Express runs middleware in order, so this only needs to sit in front of the routes we want protected.
module.exports = function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

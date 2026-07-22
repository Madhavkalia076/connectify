// Express recognizes an error-handling middleware specifically by its arity — four parameters,
// not the usual three (req, res, next). This one is mounted last, after every route and every
// other middleware in app.js, so it's the one thing every next(err) call and every error a
// catchAsync-wrapped handler forwards eventually lands on. One place to log, one place to decide
// what the user sees, instead of every route inventing its own ad hoc error response.
module.exports = function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.status || 500;

  // Routes that expect JSON back (file upload endpoints, message-deletion endpoints called via
  // fetch()) should still get JSON on failure, not an HTML error page their client-side code has
  // no way to render. This is a simple heuristic, not real content negotiation — good enough for
  // the shape of this app's routes.
  const wantsJson = req.originalUrl.includes('/upload') || req.xhr || req.get('Accept') === 'application/json';
  if (wantsJson) {
    return res.status(status).json({ error: 'Something went wrong. Please try again.' });
  }

  // Never show a raw error message for a 500 — it could leak internal details (a stack trace, a
  // database error string). A 4xx (like the 404 handler in app.js) has a message that's already
  // meant to be user-facing, so it's safe to pass through.
  res.status(status).render('error', {
    status,
    message: status === 500 ? 'Something went wrong on our end. Please try again.' : err.message,
  });
};

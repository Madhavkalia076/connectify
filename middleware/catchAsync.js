// Express 4 (what this project uses) does NOT automatically catch a rejected Promise thrown
// inside an async route handler. If an `await` inside `router.get('/x', async (req, res) => {...})`
// throws, that becomes an unhandled promise rejection — Express never sees it, so it never reaches
// the centralized error handler (middleware/errorHandler.js), and the request just hangs until it
// times out with no useful response. (Express 5 fixes this natively; we're not on it here.)
//
// Wrapping every async handler in this closes that gap: `fn(req, res, next).catch(next)` means any
// rejection is explicitly forwarded to `next(err)`, which is exactly what routes it into Express's
// error-handling middleware chain.
module.exports = function catchAsync(fn) {
  return function (req, res, next) {
    fn(req, res, next).catch(next);
  };
};

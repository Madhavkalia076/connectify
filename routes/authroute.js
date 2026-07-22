const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const catchAsync = require('../middleware/catchAsync');

const SALT_ROUNDS = 10; // how many times bcrypt "folds" the hash — higher = slower = more brute-force resistant

// Stricter than signup — this is specifically to slow down brute-force password guessing against
// an existing account. 10 attempts per 15 minutes per IP is generous for a real forgetful human,
// punishing for a script trying thousands of passwords. Keyed by IP by default (express-rate-limit's
// standard behavior) — a real limitation worth knowing: someone behind a shared/corporate IP shares
// this budget with everyone else on that IP, and a determined attacker rotating IPs isn't slowed by
// this at all. A production system would usually layer this with per-account lockout too.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true, // sends RateLimit-* headers so a well-behaved client can see its own budget
  legacyHeaders: false,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

// Looser than login — signup abuse (mass account creation) is a real but lower-urgency risk than
// credential stuffing against a specific known account.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many accounts created from this network recently. Please try again later.',
});

// Username format is restricted to letters/numbers/underscores for a concrete reason, not just
// tidiness: a DM's roomId is built as "dm:" + the two participants' usernames joined by ":"
// (see lib/dm.js), and parsed back apart the same way. A colon in a username would silently break
// that parsing. Rejecting it at signup is cheaper than handling it everywhere downstream.
const signupValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters.')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
];

// Login only checks that *something* was submitted, deliberately not re-validating format —
// tightening signup rules later shouldn't ever lock an already-registered user out of their own
// account just because their existing username/password predates the newer rule.
const loginValidation = [
  body('username').trim().notEmpty().withMessage('Username is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

router.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

router.post('/signup', signupLimiter, signupValidation, catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // .array()[0] — just show the first problem found rather than a wall of every rule violated
    // at once, which is friendlier for a normal user and still points at something concrete.
    return res.render('signup', { error: errors.array()[0].msg });
  }

  const { username, password } = req.body;

  const existing = await User.findOne({ username });
  if (existing) {
    return res.render('signup', { error: 'That username is already taken.' });
  }

  // never store the plaintext password — only the bcrypt hash of it
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ username, passwordHash });

  // log the user in immediately after signup by writing to their session
  req.session.userId = user._id.toString();
  req.session.username = user.username;
  // Kept in the session (not looked up from the DB on every request) so the requireProfile
  // middleware can gate access to chat without an extra database round-trip per page load.
  req.session.profileComplete = user.profileComplete;

  // A brand-new signup always has profileComplete: false — requireProfile on /chat will catch
  // that and redirect to /profile/setup, so there's no need to branch on it here too.
  res.redirect('/chat');
}));

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', loginLimiter, loginValidation, catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('login', { error: errors.array()[0].msg });
  }

  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) {
    // deliberately vague — "user not found" vs "wrong password" tells an attacker which
    // usernames exist on the system (username enumeration)
    return res.render('login', { error: 'Invalid username or password.' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.render('login', { error: 'Invalid username or password.' });
  }

  req.session.userId = user._id.toString();
  req.session.username = user.username;
  req.session.profileComplete = user.profileComplete;

  res.redirect('/chat');
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;

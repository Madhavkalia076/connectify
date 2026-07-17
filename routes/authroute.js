const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');

const SALT_ROUNDS = 10; // how many times bcrypt "folds" the hash — higher = slower = more brute-force resistant

router.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('signup', { error: 'Username and password are required.' });
  }

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

  res.redirect('/chat');
});

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
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

  res.redirect('/chat');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;

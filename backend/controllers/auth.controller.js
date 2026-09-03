const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const register = async (req, res, next) => {
  try {
    const { username, email, password, role } = req.body;

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ message: 'Username or email already taken' });

    const user  = await User.create({ username, email, password, role });
    const token = signToken(user._id);

    res.status(201).json({ token, user: { id: user._id, username, email, role: user.role } });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);
    res.json({ token, user: { id: user._id, username: user.username, email, role: user.role, avatar: user.avatar } });
  } catch (err) {
    next(err);
  }
};

// Called after GitHub OAuth completes (passport callback)
const githubCallback = (req, res) => {
  const token = signToken(req.user._id);
  res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
};

const getMe = async (req, res) => {
  res.json(req.user);
};

module.exports = { register, login, githubCallback, getMe };

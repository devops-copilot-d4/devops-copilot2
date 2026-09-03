const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username:    { type: String, required: true, unique: true, trim: true },
    email:       { type: String, required: true, unique: true, lowercase: true },
    password:    { type: String, select: false }, // hidden by default
    role:        { type: String, enum: ['admin', 'developer', 'viewer'], default: 'developer' },
    githubId:    { type: String },
    accessToken: { type: String, select: false }, // GitHub OAuth token
    avatar:      { type: String },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);

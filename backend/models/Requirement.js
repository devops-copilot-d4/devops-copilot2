const mongoose = require('mongoose');

const requirementSchema = new mongoose.Schema(
  {
    service:     { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    title:       { type: String, required: true },
    description: { type: String, required: true },
    priority:    { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: {
      type: String,
      enum: ['pending', 'active', 'met', 'violated', 'deprecated'],
      default: 'pending',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Requirement', requirementSchema);

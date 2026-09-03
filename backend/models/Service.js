const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true },
    repoUrl:        { type: String, required: true },
    owner:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    namespace:      { type: String, default: 'default' },
    deploymentName: { type: String },
    imageName:      { type: String },
    port:           { type: Number, default: 80 },
    status: {
      type: String,
      enum: ['pending', 'building', 'running', 'failed', 'unknown'],
      default: 'pending',
    },
    tags:           [{ type: String }],
    description:    { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Service', serviceSchema);

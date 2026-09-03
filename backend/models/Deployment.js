const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema(
  {
    service:     { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    commitSha:   { type: String },
    commitMessage: { type: String },
    branch:      { type: String, default: 'main' },
    buildStatus: {
      type: String,
      enum: ['queued', 'building', 'success', 'failed'],
      default: 'queued',
    },
    deployStatus: {
      type: String,
      enum: ['pending', 'deploying', 'running', 'failed', 'rolled_back'],
      default: 'pending',
    },
    logs:        { type: String },   // raw build/deploy logs → fed to RCA
    duration:    { type: Number },   // build duration in seconds
    githubRunId: { type: String },   // GitHub Actions run ID for tracking
    failureScore: { type: Number, min: 0, max: 1 }, // XGBoost prediction score
  },
  { timestamps: true }
);

// Index for fast time-series queries on the dashboard
deploymentSchema.index({ service: 1, createdAt: -1 });
deploymentSchema.index({ buildStatus: 1, deployStatus: 1 });

module.exports = mongoose.model('Deployment', deploymentSchema);

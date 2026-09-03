const mongoose = require('mongoose');

const recoveryActionSchema = new mongoose.Schema(
  {
    incident:   { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
    service:    { type: mongoose.Schema.Types.ObjectId, ref: 'Service',  required: true },
    actionType: {
      type: String,
      enum: ['restart', 'rollback', 'scale_up', 'scale_down', 'alert_only'],
      required: true,
    },
    reason:           { type: String },   // LLM-generated explanation
    requiresApproval: { type: Boolean, default: false },
    approvedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:       { type: Date },
    status: {
      type: String,
      enum: ['pending_approval', 'executing', 'success', 'failed', 'skipped'],
      default: 'pending_approval',
    },
    requirementVerified: { type: Boolean, default: false }, // SLO re-check after recovery
    executionLog:        { type: String },
    duration:            { type: Number }, // execution duration in ms
  },
  { timestamps: true }
);

recoveryActionSchema.index({ incident: 1 });
recoveryActionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RecoveryAction', recoveryActionSchema);

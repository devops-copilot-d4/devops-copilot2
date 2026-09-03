const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema(
  {
    service:    { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    deployment: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment' },
    slo:        { type: mongoose.Schema.Types.ObjectId, ref: 'SLO' },
    type: {
      type: String,
      enum: ['predicted_violation', 'active_violation', 'build_failure', 'runtime_failure'],
      required: true,
    },
    severity:        { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    rootCause:       { type: String },   // LLM-generated RCA
    affectedComponent: { type: String }, // LLM-identified component
    confidence:      { type: Number, min: 0, max: 1 },
    rawLogsSnapshot: { type: String },
    xgboostScore:    { type: Number, min: 0, max: 1 }, // failure probability from ML model
    status: {
      type: String,
      enum: ['open', 'diagnosing', 'recovering', 'resolved'],
      default: 'open',
    },
    resolvedAt: { type: Date },
    ttd:        { type: Number }, // time-to-detect in seconds
    ttr:        { type: Number }, // time-to-resolve in seconds
  },
  { timestamps: true }
);

incidentSchema.index({ service: 1, status: 1 });
incidentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Incident', incidentSchema);

const mongoose = require('mongoose');

const sloSchema = new mongoose.Schema(
  {
    requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement', required: true },
    service:     { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    metricName:  { type: String, required: true },
    queryExpression: { type: String, required: true }, // PromQL
    threshold:   { type: Number, required: true },
    comparator:  { type: String, enum: ['<', '<=', '>', '>=', '=='], default: '<' },
    unit:        { type: String },
    promqlHint:  { type: String },
    status:      { type: String, enum: ['met', 'violated', 'unknown'], default: 'unknown' },
    lastCheckedAt: { type: Date },
    lastValue:   { type: Number },
  },
  { timestamps: true }
);

sloSchema.index({ service: 1 });
sloSchema.index({ requirement: 1 });

module.exports = mongoose.model('SLO', sloSchema);

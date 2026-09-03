const mongoose = require('mongoose');

const metricSchema = new mongoose.Schema(
  {
    service:         { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    name:            { type: String, required: true },
    queryExpression: { type: String, required: true }, // PromQL
    unit:            { type: String },
    description:     { type: String },
    values: [
      {
        timestamp: { type: Date },
        value:     { type: Number },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Metric', metricSchema);

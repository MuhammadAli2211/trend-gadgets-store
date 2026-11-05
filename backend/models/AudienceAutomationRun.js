const mongoose = require("mongoose");

const audienceAutomationRunSchema = new mongoose.Schema(
  {
    workflowName: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: String, enum: ["success", "warning", "failed"], required: true },
    summary: { type: String, default: "", maxlength: 500 },
    errorMessage: { type: String, default: "", maxlength: 500 },
    finishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

audienceAutomationRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
audienceAutomationRunSchema.index({ workflowName: 1, createdAt: -1 });

module.exports = mongoose.model("AudienceAutomationRun", audienceAutomationRunSchema);

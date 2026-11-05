const mongoose = require("mongoose");

const audienceGrowthSnapshotSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: ["facebook", "instagram"], required: true },
    capturedDate: { type: Date, required: true },
    followers: { type: Number, min: 0, default: null },
    profileEngagements: { type: Number, min: 0, default: 0 },
    source: { type: String, enum: ["meta_api", "manual"], default: "meta_api" },
  },
  { timestamps: true }
);

audienceGrowthSnapshotSchema.index({ platform: 1, capturedDate: 1 }, { unique: true });

module.exports = mongoose.model("AudienceGrowthSnapshot", audienceGrowthSnapshotSchema);

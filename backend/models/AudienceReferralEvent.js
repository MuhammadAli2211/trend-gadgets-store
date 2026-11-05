const mongoose = require("mongoose");

const audienceReferralEventSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "AudienceReferralCampaign", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

audienceReferralEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
audienceReferralEventSchema.index({ campaign: 1, createdAt: -1 });

module.exports = mongoose.model("AudienceReferralEvent", audienceReferralEventSchema);

const mongoose = require("mongoose");

const audienceReferralCampaignSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    caption: { type: String, default: "", maxlength: 1000 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AudienceReferralCampaign", audienceReferralCampaignSchema);

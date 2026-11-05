const mongoose = require("mongoose");

const audienceEngagementSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["instagram", "facebook"], required: true },
    externalId: { type: String, required: true },
    mediaId: { type: String, default: "" },
    actorHandle: { type: String, default: "", maxlength: 120 },
    commentText: { type: String, default: "", maxlength: 1200 },
    contentUrl: { type: String, default: "", maxlength: 500 },
    category: { type: String, default: "", maxlength: 80 },
    intent: { type: String, enum: ["product_inquiry", "purchase_interest", "general", "other"], default: "other" },
    replyDraft: { type: String, default: "", maxlength: 500 },
    status: { type: String, enum: ["pending_review", "replied_manually", "ignored"], default: "pending_review" },
  },
  { timestamps: true }
);

audienceEngagementSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
audienceEngagementSchema.index({ status: 1, platform: 1, createdAt: -1 });

module.exports = mongoose.model("AudienceEngagement", audienceEngagementSchema);

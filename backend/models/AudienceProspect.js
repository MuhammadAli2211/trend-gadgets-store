const mongoose = require("mongoose");

const audienceProspectSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["instagram", "facebook", "other"],
      required: true,
    },
    handle: { type: String, required: true, trim: true, maxlength: 120 },
    normalizedHandle: { type: String, required: true, trim: true, lowercase: true },
    profileUrl: { type: String, default: "", maxlength: 500 },
    contentUrl: { type: String, default: "", maxlength: 500 },
    category: { type: String, default: "", trim: true, maxlength: 80 },
    location: { type: String, default: "", trim: true, maxlength: 80 },
    source: {
      type: String,
      enum: ["manual", "instagram_comment", "facebook_comment", "mention", "hashtag", "referral"],
      default: "manual",
    },
    interestSignals: { type: [String], default: [], validate: [(items) => items.length <= 12, "A prospect can have up to 12 interest signals."] },
    status: {
      type: String,
      enum: ["new", "review", "invited", "followed", "customer", "not_interested"],
      default: "review",
    },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

audienceProspectSchema.index({ platform: 1, normalizedHandle: 1 }, { unique: true });
audienceProspectSchema.index({ status: 1, category: 1, updatedAt: -1 });

module.exports = mongoose.model("AudienceProspect", audienceProspectSchema);

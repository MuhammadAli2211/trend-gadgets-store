const mongoose = require("mongoose");

const socialAccountSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["facebook", "instagram", "tiktok"],
      required: true,
    },

    accountName: {
      type: String,
      required: true,
      trim: true,
    },

    // Page ID / Instagram account ID / TikTok account ID
    accountId: {
      type: String,
      default: "",
    },

    // Page access token / platform access token
    accessToken: {
      type: String,
      default: "",
    },

    // Facebook User token used only to query Instagram's authorized audio catalog.
    instagramAudioAccessToken: {
      type: String,
      default: "",
    },

    // Facebook Page specific
    pageId: {
      type: String,
      default: "",
    },

    pageName: {
      type: String,
      default: "",
    },

    // Instagram Business/Professional account linked with Facebook Page
    instagramAccountId: {
      type: String,
      default: "",
    },

    instagramUsername: {
      type: String,
      default: "",
    },

    tokenType: {
      type: String,
      default: "page",
    },

    tokenExpiresAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["connected", "disconnected"],
      default: "connected",
    },
  },
  {
    timestamps: true,
  }
);

socialAccountSchema.index({
  platform: 1,
  accountId: 1,
});

module.exports = mongoose.model(
  "SocialAccount",
  socialAccountSchema
);

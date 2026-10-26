const mongoose = require("mongoose");

const trackingSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "view",
        "click",
        "whatsapp",
        "buy-now",
      ],
      required: true,
    },

    productId: {
      type: String,
      default: "",
    },

    contentId: {
      type: String,
      default: "",
    },

    source: {
      type: String,
      default: "direct",
    },

    platform: {
      type: String,
      default: "unknown",
    },

    userAgent: {
      type: String,
      default: "",
    },

    ip: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

trackingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model(
  "Tracking",
  trackingSchema
);

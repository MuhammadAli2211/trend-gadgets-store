const mongoose = require("mongoose");

const contentSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    type: {
      type: String,
      enum: ["post", "reel", "caption"],
      required: true,
    },

    platform: {
      type: String,
      enum: [
        "facebook",
        "instagram",
        "tiktok",
        "all",
      ],
      required: true,
    },

    caption: {
      type: String,
      default: "",
      trim: true,
    },

    media: {
      url: {
        type: String,
        default: "",
      },

      publicId: {
        type: String,
        default: "",
      },

      resourceType: {
        type: String,
        default: "",
      },
    },

    // =========================
    // AUTOMATION DATA
    // =========================

    generatedAutomatically: {
      type: Boolean,
      default: false,
    },

    // Legacy generated photo Reels may contain the old synthetic track.
    // New photo Reels are silent; uploaded product videos retain source audio.
    audioMode: {
      type: String,
      enum: ["legacy", "none", "original"],
      default: "legacy",
    },

    publishedPostId: {
      type: String,
      default: "",
    },

    publishedPosts: {
      type: [
        {
          platform: {
            type: String,
          enum: ["facebook", "instagram", "tiktok", "whatsapp"],
          },
          postId: { type: String, default: "" },
          publishedUrl: { type: String, default: "" },
          publishedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },

    publishedUrl: {
      type: String,
      default: "",
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    // =========================
    // CONTENT STATUS
    // =========================

    status: {
      type: String,
      enum: [
        "draft",
        "approved",
        "rejected",
        "scheduled",
        "published",
      ],
      default: "draft",
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

contentSchema.index({
  product: 1,
  platform: 1,
  createdAt: -1,
});

contentSchema.index({
  generatedAutomatically: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "Content",
  contentSchema
);

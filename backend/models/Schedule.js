const mongoose = require("mongoose");

const publishedPostSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["facebook", "instagram", "tiktok", "whatsapp"],
      required: true,
    },

    postId: {
      type: String,
      default: "",
    },

    publishedUrl: {
      type: String,
      default: "",
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    attemptedAt: {
      type: Date,
      default: null,
    },

    attempting: {
      type: Boolean,
      default: false,
    },

    deletedPreviousPost: {
      type: Boolean,
      default: false,
    },

    deleteMessage: {
      type: String,
      default: "",
    },

    success: {
      type: Boolean,
      default: false,
    },

    manualRequired: {
      type: Boolean,
      default: false,
    },

    error: {
      type: String,
      default: "",
    },
  },
  {
    _id: false,
  }
);

const scheduleSchema = new mongoose.Schema(
  {
    content: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
    },

    // New system
    platforms: {
      type: [
        {
          type: String,
          enum: ["facebook", "instagram", "tiktok", "whatsapp"],
        },
      ],
      default: [],
    },

    // Old field kept for backward compatibility
    platform: {
      type: String,
      enum: ["facebook", "instagram", "tiktok", "whatsapp"],
      default: null,
    },

    scheduledAt: {
      type: Date,
      required: true,
    },

    repeatEnabled: {
      type: Boolean,
      default: false,
    },

    // 1 = every day
    // 2 = every 2 days
    repeatEvery: {
      type: Number,
      min: 1,
      default: 1,
    },

    repeatUnit: {
      type: String,
      enum: ["days"],
      default: "days",
    },

    generateNewContent: {
      type: Boolean,
      default: false,
    },

    autoDeletePrevious: {
      type: Boolean,
      default: true,
    },

    retryOnlyFailed: {
      type: Boolean,
      default: false,
    },

    retryCount: {
      type: Number,
      default: 0,
    },

    retryForScheduledAt: {
      type: Date,
      default: null,
    },

    retryRecoveryApplied: {
      type: Boolean,
      default: false,
    },

    // Legacy Facebook/current post fields
    previousPublishedPostId: {
      type: String,
      default: "",
    },

    publishedPostId: {
      type: String,
      default: "",
    },

    publishedUrl: {
      type: String,
      default: "",
    },

    // New multi-platform publishing history
    publishedPosts: {
      type: [publishedPostSchema],
      default: [],
    },

    status: {
      type: String,
      enum: [
        "scheduled",
        "processing",
        "published",
        "failed",
        "cancelled",
        "manual_required",
      ],
      default: "scheduled",
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    errorMessage: {
      type: String,
      default: "",
    },

    runCount: {
      type: Number,
      default: 0,
    },

    lastRunAt: {
      type: Date,
      default: null,
    },

    currentRunStartedAt: {
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

scheduleSchema.index({
  status: 1,
  scheduledAt: 1,
});

scheduleSchema.index({
  "platforms": 1,
  content: 1,
});

scheduleSchema.index({
  platform: 1,
  content: 1,
});

module.exports = mongoose.model(
  "Schedule",
  scheduleSchema
);

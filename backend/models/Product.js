const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    comparePrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    tags: {
      type: [String],
      default: [],
      validate: [(tags) => tags.length <= 20, "A product can have up to 20 tags."],
    },

    sku: {
      type: String,
      default: "",
      trim: true,
    },

    // Keeps a browser retry from creating the same product twice when the
    // original save succeeded but its response was lost.
    creationRequestId: {
      type: String,
      select: false,
    },

    images: [
      {
        url: {
          type: String,
          required: true,
        },

        publicId: {
          type: String,
          default: "",
        },
      },
    ],

    video: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },

    videos: [
      {
        url: { type: String, required: true },
        publicId: { type: String, default: "" },
      },
    ],

    whatsappNumber: {
      type: String,
      default: "",
      trim: true,
    },

    whatsappMessage: {
      type: String,
      default: "",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    deletedAt: {
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

productSchema.index(
  { creationRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { creationRequestId: { $type: "string" } },
  }
);

module.exports = mongoose.model(
  "Product",
  productSchema
);

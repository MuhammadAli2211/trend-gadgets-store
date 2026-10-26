const fs = require("fs");
const path = require("path");

const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;

const Product = require("../models/Product");
const Content = require("../models/Content");
const { createReel } = require("../utils/reelGenerator");

// =========================
// CLOUDINARY CONFIG
// =========================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =========================
// GET PRODUCT
// =========================

const getProduct = async (productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error("Invalid product ID.");
  }

  const product = await Product.findById(productId).lean();

  if (!product) {
    throw new Error("Product not found.");
  }

  return product;
};

// =========================
// GET PRODUCT IMAGES
// =========================

const getProductImages = (product) => {
  if (!product.images || !Array.isArray(product.images)) {
    return [];
  }

  return product.images
    .map((image) => {
      if (typeof image === "string") {
        return image;
      }

      return (
        image?.url ||
        image?.secure_url ||
        image?.path ||
        ""
      );
    })
    .filter(Boolean);
};

// =========================
// UPLOAD REEL TO CLOUDINARY
// =========================

const uploadReelToCloudinary = async (filePath) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error(
      "CLOUDINARY_CLOUD_NAME is missing."
    );
  }

  if (!process.env.CLOUDINARY_API_KEY) {
    throw new Error(
      "CLOUDINARY_API_KEY is missing."
    );
  }

  if (!process.env.CLOUDINARY_API_SECRET) {
    throw new Error(
      "CLOUDINARY_API_SECRET is missing."
    );
  }

  const result = await cloudinary.uploader.upload(
    filePath,
    {
      resource_type: "video",
      folder: "ecommerce/reels",
      format: "mp4",
    }
  );

  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
  };
};

// =========================
// CREATE FRESH REEL CONTENT
// =========================

const generateFreshReelContent = async ({
  productId,
  platform,
  createdBy,
}) => {
  let reel = null;
  let uploaded = null;
  let saved = false;
  try {
  const product = await getProduct(productId);

  const images = getProductImages(product);

  if (images.length === 0) {
    throw new Error(
      `Product "${product.name}" has no images.`
    );
  }

  console.log(
    "======================================"
  );

  console.log(
    "GENERATING FRESH AUTOMATIC REEL"
  );

  console.log(
    "Product:",
    product.name
  );

  console.log(
    "Platform:",
    platform
  );

  console.log(
    "======================================"
  );

  // =========================
  // GENERATE VIDEO
  // =========================

  reel = await createReel({
    images,
    productName: product.name,
    price: product.price,
  });

  if (!reel?.outputPath) {
    throw new Error(
      "Reel generator did not return a video."
    );
  }

  // =========================
  // UPLOAD
  // =========================

  uploaded =
    await uploadReelToCloudinary(
      reel.outputPath
    );

  // =========================
  // CREATE CONTENT
  // =========================

  const caption =
    `🔥 ${product.name}\n\n` +
    `💰 Price: Rs. ${product.price || ""}\n\n` +
    `📲 Buy Now on WhatsApp\n\n` +
    `#shopping #onlineShopping #pakistan #deals`;

  const content =
    await Content.create({
      product: product._id,

      type: "reel",

      platform,

      caption,

      media: {
        url: uploaded.url,
        publicId: uploaded.publicId,
        resourceType:
          uploaded.resourceType || "video",
      },

      generatedAutomatically: true,

      status: "approved",

      createdBy,
    });
  saved = true;

  // =========================
  // CLEAN TEMP FILES
  // =========================

  console.log(
    "Fresh Reel Content Created:",
    content._id.toString()
  );

  return content;
  } catch (error) {
    if (!saved && uploaded?.publicId) {
      try {
        await cloudinary.uploader.destroy(uploaded.publicId, {
          resource_type: uploaded.resourceType || "video",
        });
      } catch (cleanupError) {
        console.error("Generated Reel Cloudinary cleanup warning:", cleanupError.message);
      }
    }
    throw error;
  } finally {
    try {
      if (reel?.tempDir) {
        fs.rmSync(reel.tempDir, { recursive: true, force: true });
      } else if (reel?.outputPath) {
        fs.rmSync(reel.outputPath, { force: true });
      }
    } catch (cleanupError) {
      console.error("Temporary reel cleanup warning:", cleanupError.message);
    }
  }
};

module.exports = {
  generateFreshReelContent,
  uploadReelToCloudinary,
};

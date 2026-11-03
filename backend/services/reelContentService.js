const fs = require("fs");
const path = require("path");

const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;

const Product = require("../models/Product");
const Content = require("../models/Content");
const { createReel } = require("../utils/reelGenerator");
const { getProductVideoAsset } = require("../utils/productVideo");

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

const generateProductImageReelAsset = async (product) => {
  if (!product) throw new Error("Product is required to generate a Reel.");
  const images = getProductImages(product).slice(0, 5);
  if (images.length === 0) throw new Error(`Product "${product.name}" has no images.`);

  let reel = null;
  try {
    reel = await createReel({
      images,
      productName: product.name,
      price: product.price,
    });
    if (!reel?.outputPath) throw new Error("Reel generator did not return a video.");
    const uploaded = await uploadReelToCloudinary(reel.outputPath);
    return {
      url: uploaded.url,
      publicId: uploaded.publicId,
      resourceType: uploaded.resourceType || "video",
    };
  } finally {
    try {
      if (reel?.tempDir) fs.rmSync(reel.tempDir, { recursive: true, force: true });
      else if (reel?.outputPath) fs.rmSync(reel.outputPath, { force: true });
    } catch (cleanupError) {
      console.error("Temporary product Reel cleanup warning:", cleanupError.message);
    }
  }
};

const deleteGeneratedReelAsset = async (asset) => {
  if (!asset?.publicId) return;
  try {
    await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType || "video",
    });
  } catch (error) {
    console.error("Old generated Reel cleanup warning:", error.message);
  }
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
  let uploadedGeneratedAsset = false;
  try {
  const product = await getProduct(productId);

  const images = getProductImages(product);
  const productVideo = getProductVideoAsset(product);
  const videoUrl = productVideo?.url || "";

  if (images.length === 0 && !videoUrl) {
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

  if (videoUrl) {
    // Keep the seller's uploaded product video intact for scheduled Reels.
    uploaded = {
      url: videoUrl,
      publicId: productVideo.publicId || "",
      resourceType: "video",
    };
  } else {
    reel = await createReel({
      images: images.slice(0, 5),
      productName: product.name,
      price: product.price,
    });

    if (!reel?.outputPath) throw new Error("Reel generator did not return a video.");
    uploaded = await uploadReelToCloudinary(reel.outputPath);
    uploadedGeneratedAsset = true;
  }

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

      audioMode: videoUrl ? "original" : "none",

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
    if (!saved && uploadedGeneratedAsset && uploaded?.publicId) {
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
  generateProductImageReelAsset,
  deleteGeneratedReelAsset,
  uploadReelToCloudinary,
};

const Content = require("../models/Content");
const Product = require("../models/Product");
const mongoose = require("mongoose");
const Schedule = require("../models/Schedule");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { createReel } = require("../utils/reelGenerator");
const { appendProductHashtags, createProductSocialCaption } = require("../utils/socialCaption");

const reelGenerationLocks = new Set();

const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ecommerce-automation/content",
        resource_type: "auto",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  } catch (error) {
    console.error(
      "Cloudinary delete error:",
      error.response?.body || error.message
    );
  }
};

const uploadVideoToCloudinary = (filePath) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        folder: "ecommerce-automation/reels",
        resource_type: "video",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

// GET ALL CONTENT
const getContent = async (req, res) => {
  try {
    const { search, type, platform, status, product, archived, includeArchived } = req.query;

    const filter = {};

    if (archived === "true") {
      filter.archivedAt = { $ne: null };
    } else if (includeArchived !== "true") {
      filter.archivedAt = null;
    }

    if (type) {
      filter.type = type;
    }

    if (platform) {
      filter.platform = platform;
    }

    if (status) {
      filter.status = status;
    }

    if (product) {
      filter.product = product;
    }

    if (search) {
      filter.caption = {
        $regex: search,
        $options: "i",
      };
    }

    const contents = await Content.find(filter)
      .populate("product", "name price category images")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: contents.length,
      contents,
    });
  } catch (error) {
    console.error("Get content error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch content.",
    });
  }
};

// GET SINGLE CONTENT
const getContentById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid content ID." });
    }
    const content = await Content.findById(req.params.id)
      .populate("product", "name price category images description")
      .populate("createdBy", "name email");

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content not found.",
      });
    }

    res.json({
      success: true,
      content,
    });
  } catch (error) {
    console.error("Get content by ID error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch content.",
    });
  }
};

// CREATE CONTENT
const createContent = async (req, res) => {
  let uploadedMedia = null;
  let contentCreated = false;
  try {
    const { product, type, platform, caption } = req.body;

    if (!product || !mongoose.isValidObjectId(product)) {
      return res.status(400).json({
        success: false,
        message: "Product is required.",
      });
    }

    if (!["post", "reel", "caption"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Content type is required.",
      });
    }

    if (!["facebook", "instagram", "tiktok", "all"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Platform is required.",
      });
    }

    const existingProduct = await Product.findById(product);

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: "Selected product not found.",
      });
    }

    if (type === "reel" && !req.file?.mimetype?.startsWith("video/")) {
      return res.status(400).json({ success: false, message: "Reel content needs a video file." });
    }
    if (type === "post" && !req.file) {
      return res.status(400).json({ success: false, message: "Post content needs an image or video file." });
    }
    if (type === "post" && platform === "instagram" && req.file?.mimetype?.startsWith("video/")) {
      return res.status(400).json({ success: false, message: "Instagram feed posts require an image. Use Reel for video." });
    }

    let media = {
      url: "",
      publicId: "",
      resourceType: "",
    };

    if (req.file) {
      const uploaded = await uploadToCloudinary(req.file);
      uploadedMedia = uploaded;

      media = {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
        resourceType: uploaded.resource_type,
      };
    }

    if (type === "caption" && !String(caption || "").trim()) {
      return res.status(400).json({ success: false, message: "Caption content cannot be empty." });
    }

    const content = await Content.create({
      product,
      type,
      platform,
      caption: appendProductHashtags(caption || "", existingProduct),
      media,
      status: "draft",
      createdBy: req.user._id,
    });
    contentCreated = true;

    const populatedContent = await Content.findById(content._id)
      .populate("product", "name price category images")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Content created successfully.",
      content: populatedContent,
    });
  } catch (error) {
    if (!contentCreated && uploadedMedia?.public_id) {
      await deleteFromCloudinary(uploadedMedia.public_id, uploadedMedia.resource_type || "image");
    }
    console.error("Create content error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Unable to create content.",
    });
  }
};

// UPDATE CONTENT
const updateContent = async (req, res) => {
  let newUploadedMedia = null;
  let previousMedia = null;
  let updateSaved = false;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid content ID." });
    }
    const content = await Content.findById(req.params.id);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content not found.",
      });
    }
    if (["scheduled", "published"].includes(content.status)) {
      return res.status(409).json({ success: false, message: "Scheduled or published content cannot be edited." });
    }

    const {
      product,
      type,
      platform,
      caption,
      status,
      rejectionReason,
    } = req.body;

    if (product !== undefined && !mongoose.isValidObjectId(product)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    if (type !== undefined && !["post", "reel", "caption"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid content type." });
    }
    if (platform !== undefined && !["facebook", "instagram", "tiktok", "all"].includes(platform)) {
      return res.status(400).json({ success: false, message: "Invalid platform." });
    }
    if (status !== undefined && !["draft", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Change content status through the approval workflow." });
    }

    const nextType = type ?? content.type;
    const nextPlatform = platform ?? content.platform;
    const existingProductForCaption = await Product.findById(product || content.product);
    const nextCaption = appendProductHashtags(caption ?? content.caption, existingProductForCaption);
    const nextResourceType = req.file
      ? (req.file.mimetype.startsWith("video/") ? "video" : "image")
      : content.media?.resourceType;
    const hasNextMedia = Boolean(req.file || content.media?.url);
    if (nextType === "reel" && (!hasNextMedia || nextResourceType !== "video")) {
      return res.status(400).json({ success: false, message: "Reel content needs a video file." });
    }
    if (nextType === "post" && req.file?.mimetype?.startsWith("video/") && nextPlatform === "instagram") {
      return res.status(400).json({ success: false, message: "Instagram feed posts require an image. Use Reel for video." });
    }
    if (nextType === "post" && !hasNextMedia) {
      return res.status(400).json({ success: false, message: "Post content needs an image or video file." });
    }
    if (nextType === "caption" && !String(nextCaption || "").trim()) {
      return res.status(400).json({ success: false, message: "Caption content cannot be empty." });
    }

    if (product) {
      const existingProduct = await Product.findById(product);

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: "Selected product not found.",
        });
      }

      content.product = product;
    }

    if (type) {
      content.type = type;
    }

    if (platform) {
      content.platform = platform;
    }

    if (caption !== undefined || existingProductForCaption) {
      content.caption = nextCaption;
    }

    if (status) {
      content.status = status;
    }

    if (rejectionReason !== undefined) {
      content.rejectionReason = rejectionReason;
    }

    if (req.file) {
      const uploaded = await uploadToCloudinary(req.file);
      newUploadedMedia = uploaded;
      previousMedia = content.media;

      content.media = {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
        resourceType: uploaded.resource_type,
      };
    }

    await content.save();
    updateSaved = true;

    if (previousMedia?.publicId) {
      await deleteFromCloudinary(previousMedia.publicId, previousMedia.resourceType || "image");
    }

    const updatedContent = await Content.findById(content._id)
      .populate("product", "name price category images")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Content updated successfully.",
      content: updatedContent,
    });
  } catch (error) {
    if (!updateSaved && newUploadedMedia?.public_id) {
      await deleteFromCloudinary(newUploadedMedia.public_id, newUploadedMedia.resource_type || "image");
    }
    console.error("Update content error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Unable to update content.",
    });
  }
};

// UPDATE STATUS
const updateContentStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    const allowedStatuses = [
      "draft",
      "approved",
      "rejected",
      "scheduled",
      "published",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid content status.",
      });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid content ID." });
    }
    const content = await Content.findById(req.params.id);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content not found.",
      });
    }

    if (["scheduled", "published"].includes(content.status)) {
      return res.status(409).json({
        success: false,
        message: "Scheduled or published content status is managed by its schedule.",
      });
    }

    content.status = status;

    if (status === "rejected") {
      content.rejectionReason = rejectionReason || "";
    } else {
      content.rejectionReason = "";
    }

    await content.save();

    const updatedContent = await Content.findById(content._id)
      .populate("product", "name price category images")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: `Content marked as ${status}.`,
      content: updatedContent,
    });
  } catch (error) {
    console.error("Update content status error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update content status.",
    });
  }
};

const setContentArchived = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid content ID." });
    }
    if (typeof req.body.archived !== "boolean") {
      return res.status(400).json({ success: false, message: "archived must be true or false." });
    }

    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ success: false, message: "Content not found." });
    }

    if (req.body.archived) {
      const activeSchedule = await Schedule.exists({
        content: content._id,
        status: { $in: ["scheduled", "processing"] },
      });
      if (activeSchedule) {
        return res.status(409).json({
          success: false,
          message: "Cancel the active schedule before archiving this content.",
        });
      }
      content.archivedAt = new Date();
    } else {
      content.archivedAt = null;
    }

    await content.save();
    return res.json({
      success: true,
      message: req.body.archived ? "Content moved to archive." : "Content restored.",
      content,
    });
  } catch (error) {
    console.error("Archive content error:", error);
    return res.status(500).json({ success: false, message: "Unable to update archive." });
  }
};

// DELETE CONTENT
const deleteContent = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid content ID." });
    }
    const content = await Content.findById(req.params.id);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content not found.",
      });
    }

    const linkedSchedule = await Schedule.exists({ content: content._id });
    if (linkedSchedule) {
      return res.status(409).json({
        success: false,
        message: "This content has schedule history. Keep it to preserve publishing records.",
      });
    }

    await Content.findByIdAndDelete(req.params.id);

    if (content.media?.publicId) {
      await deleteFromCloudinary(
        content.media.publicId,
        content.media.resourceType || "image"
      );
    }

    res.json({
      success: true,
      message: "Content deleted successfully.",
    });
  } catch (error) {
    console.error("Delete content error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete content.",
    });
  }
};

const generateProductReel = async (req, res) => {
  let reelData = null;
  let uploadedMedia = null;
  let contentCreated = false;
  let generationLockKey = null;

  try {
    if (!mongoose.isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    const product = await Product.findById(
      req.params.productId
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const productVideoUrl = product.video?.url || product.videos?.[0]?.url || "";
    if ((!product.images || product.images.length === 0) && !productVideoUrl) {
      return res.status(400).json({
        success: false,
        message:
          "This product needs at least one image or video to generate a Reel.",
      });
    }

    const requestedLockKey = `${product._id}:${req.user._id}`;
    if (reelGenerationLocks.has(requestedLockKey)) {
      return res.status(409).json({
        success: false,
        message: "A Reel for this product is already being generated. Please wait.",
      });
    }
    generationLockKey = requestedLockKey;
    reelGenerationLocks.add(generationLockKey);

    const reelCaption = createProductSocialCaption(product, process.env.FRONTEND_URL || "");
    const duplicateSince = new Date(Date.now() - 60_000);
    const findRecentReel = () => Content.findOne({
      product: product._id,
      type: "reel",
      platform: "all",
      caption: reelCaption,
      createdBy: req.user._id,
      status: { $nin: ["rejected"] },
      archivedAt: null,
      createdAt: { $gte: duplicateSince },
    }).sort({ createdAt: -1 });
    const existingRecentReel = await findRecentReel();
    if (existingRecentReel) {
      const populatedExistingReel = await Content.findById(existingRecentReel._id)
        .populate("product", "name price category images")
        .populate("createdBy", "name email");
      return res.json({
        success: true,
        message: "A recent Reel already exists. Use that content instead of creating a duplicate.",
        content: populatedExistingReel,
        duplicate: true,
      });
    }

    console.log(
      `Generating reel for: ${product.name}`
    );

    reelData = await createReel({
      images: product.images,
      videoUrl: productVideoUrl,
      productName: product.name,
      price: product.price,
    });

    // Check again after rendering so a near-simultaneous second request can
    // reuse the first Reel instead of uploading and saving another copy.
    const existingRenderedReel = await findRecentReel();
    if (existingRenderedReel) {
      const populatedExistingReel = await Content.findById(existingRenderedReel._id)
        .populate("product", "name price category images")
        .populate("createdBy", "name email");
      return res.json({
        success: true,
        message: "A recent Reel already exists. Use that content instead of creating a duplicate.",
        content: populatedExistingReel,
        duplicate: true,
      });
    }

    console.log(
      "Reel generated successfully. Uploading to Cloudinary..."
    );

    const uploaded = await uploadVideoToCloudinary(
      reelData.outputPath
    );
    uploadedMedia = uploaded;

    const content = await Content.create({
      product: product._id,

      type: "reel",

      platform: "all",

      caption: reelCaption,

      media: {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
        resourceType: uploaded.resource_type,
      },

      status: "draft",

      createdBy: req.user._id,
    });
    contentCreated = true;

    const populatedContent =
      await Content.findById(content._id)
        .populate(
          "product",
          "name price category images"
        )
        .populate(
          "createdBy",
          "name email"
        );

    res.status(201).json({
      success: true,
      message: "Reel generated successfully.",
      content: populatedContent,
    });
  } catch (error) {
    if (!contentCreated && uploadedMedia?.public_id) {
      await deleteFromCloudinary(uploadedMedia.public_id, uploadedMedia.resource_type || "video");
    }
    console.error(
      "Generate product reel error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to generate reel.",
    });
  } finally {
    if (reelData?.tempDir) {
      try {
        const fs = require("fs");

        fs.rmSync(reelData.tempDir, {
          recursive: true,
          force: true,
        });
      } catch (error) {
        console.error(
          "Temporary files cleanup error:",
          error.message
        );
      }
    }
    if (generationLockKey) {
      reelGenerationLocks.delete(generationLockKey);
    }
  }
};

module.exports = {
  getContent,
  getContentById,
  createContent,
  updateContent,
  updateContentStatus,
  setContentArchived,
  deleteContent,
    generateProductReel,
};

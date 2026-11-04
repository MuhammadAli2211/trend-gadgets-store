const Product = require("../models/Product");
const Content = require("../models/Content");
const Order = require("../models/Order");
const cloudinary = require("../config/cloudinary");
const { createProductSocialCaption } = require("../utils/socialCaption");
const { ensureAutomaticScheduleForContent } = require("../services/automaticScheduleService");
const crypto = require("crypto");

const streamifier = require("streamifier");
const parseTags = (value) => {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return [...new Set(source.map((tag) => String(tag).trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40)).filter(Boolean))].slice(0, 20);
};


// =====================================
// HELPER: CREATE SLUG
// =====================================

const createSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

const PRODUCT_MEDIA_FOLDER = "ecommerce-automation/products";

const createProductUploadSignature = (req, res) => {
  const resourceType = req.body?.resourceType;
  if (resourceType !== "video") {
    return res.status(400).json({ success: false, message: "Only product video uploads are supported here." });
  }

  const { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret } = cloudinary.config();
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(503).json({ success: false, message: "Cloudinary upload is not configured on the server." });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${PRODUCT_MEDIA_FOLDER}/upload-${crypto.randomUUID()}`;
  const paramsToSign = { folder: PRODUCT_MEDIA_FOLDER, overwrite: false, public_id: publicId, timestamp };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return res.json({
    success: true,
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder: PRODUCT_MEDIA_FOLDER,
    publicId,
  });
};

const parseUploadedVideoAssets = (rawAssets) => {
  if (!rawAssets) return [];
  const invalid = (message) => {
    const error = new Error(message);
    error.status = 400;
    throw error;
  };
  let assets;
  try {
    assets = typeof rawAssets === "string" ? JSON.parse(rawAssets) : rawAssets;
  } catch {
    return invalid("Uploaded video details are invalid.");
  }
  if (!Array.isArray(assets) || assets.length > 2) {
    return invalid("A product can have up to 2 videos.");
  }

  const cloudName = cloudinary.config().cloud_name;
  return assets.map((asset) => {
    const publicId = asset?.publicId;
    let url;
    try {
      url = new URL(asset?.url);
    } catch {
      return invalid("Uploaded video details are invalid.");
    }
    const publicIdLeaf = typeof publicId === "string" ? publicId.split("/").pop() : "";
    const validProductUploadId = /^upload-[0-9a-f-]{36}$/i.test(publicIdLeaf);
    let deliveredFileName = "";
    try {
      deliveredFileName = decodeURIComponent(url.pathname).split("/").filter(Boolean).pop()?.replace(/\.[^.]+$/, "") || "";
    } catch {
      return invalid("Uploaded video details are invalid.");
    }
    if (
      !validProductUploadId ||
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      !url.pathname.startsWith(`/${cloudName}/video/upload/`) ||
      deliveredFileName !== publicIdLeaf
    ) {
      return invalid("Uploaded video does not match a valid product upload.");
    }
    return { url: url.toString(), publicId };
  });
};

// =====================================
// HELPER: UPLOAD IMAGE TO CLOUDINARY
// =====================================

const uploadToCloudinary = (buffer, resourceType = "image") => {
  return new Promise((resolve, reject) => {
    const stream =
      cloudinary.uploader.upload_stream(
        {
          folder: "ecommerce-automation/products",
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

    streamifier
      .createReadStream(buffer)
      .pipe(stream);
  });
};

// =====================================
// HELPER: DELETE CLOUDINARY IMAGE
// =====================================

const deleteFromCloudinary = async (
  publicId,
  resourceType = "image"
) => {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (error) {
    console.error(
      "Cloudinary delete error:",
      error.message
    );
  }
};

// =====================================
// CREATE PRODUCT
// =====================================

const createProduct = async (req, res) => {
  const uploadedImages = [];
  const uploadedVideos = [];
  let createdProduct = null;
  const creationRequestId = typeof req.body?.creationRequestId === "string"
    ? req.body.creationRequestId.trim()
    : "";
  try {
    const {
      name,
      description,
      price,
      comparePrice,
      category,
      sku,
      whatsappNumber,
      whatsappMessage,
      tags,
    } = req.body;

    if (
      typeof name !== "string" || !name.trim() || name.length > 180 ||
      typeof description !== "string" || !description.trim() || description.length > 10000 ||
      price === undefined ||
      typeof category !== "string" || !category.trim() || category.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, description, price and category are required",
      });
    }

    if ((sku !== undefined && (typeof sku !== "string" || sku.length > 80)) ||
        (whatsappNumber !== undefined && (typeof whatsappNumber !== "string" || whatsappNumber.length > 32)) ||
        (whatsappMessage !== undefined && (typeof whatsappMessage !== "string" || whatsappMessage.length > 1000))) {
      return res.status(400).json({ success: false, message: "SKU or WhatsApp fields have invalid values." });
    }

    const numericPrice = Number(price);
    const numericComparePrice = Number(comparePrice || 0);
    if (!Number.isFinite(numericPrice) || numericPrice < 0 ||
        !Number.isFinite(numericComparePrice) || numericComparePrice < 0) {
      return res.status(400).json({ success: false, message: "Price and compare price must be non-negative amounts." });
    }

    const files = req.files || {};
    const imageFiles = [...(files.images || []), ...(files.productImage || [])];
    const videoFiles = [...(files.videos || []), ...(files.video || [])];
    const directVideoAssets = parseUploadedVideoAssets(req.body.videoAssets);
    if (creationRequestId && !/^[a-f0-9-]{36}$/i.test(creationRequestId)) {
      return res.status(400).json({ success: false, message: "Product submission ID is invalid." });
    }
    if (directVideoAssets.length + videoFiles.length > 2) {
      return res.status(400).json({ success: false, message: "A product can have up to 2 videos." });
    }
    if (!imageFiles.length) {
      return res.status(400).json({ success: false, message: "Upload at least one product photo. You can also add videos." });
    }
    if (imageFiles.some((file) => !file.mimetype?.startsWith("image/")) || videoFiles.some((file) => !file.mimetype?.startsWith("video/"))) {
      return res.status(400).json({ success: false, message: "Upload valid product photo and video files." });
    }

    if (creationRequestId) {
      const existingRequest = await Product.findOne({ creationRequestId })
        .select("_id name slug price images video videos")
        .lean();
      if (existingRequest) {
        await Promise.all(directVideoAssets.map((video) => deleteFromCloudinary(video.publicId, "video")));
        return res.status(200).json({ success: true, message: "Product was already saved.", product: existingRequest });
      }
    }

    for (const file of imageFiles) {
      const result = await uploadToCloudinary(file.buffer, "image");
      uploadedImages.push({ url: result.secure_url, publicId: result.public_id });
    }
    uploadedVideos.push(...directVideoAssets);
    for (const file of videoFiles) {
      const result = await uploadToCloudinary(file.buffer, "video");
      uploadedVideos.push({ url: result.secure_url, publicId: result.public_id });
    }

    let slug = createSlug(name);

    const existingSlug = await Product.findOne({
      slug,
    });

    if (existingSlug) {
      slug = `${slug}-${Date.now()}`;
    }

    const product = await Product.create({
      name: name.trim(),
      slug,
      description: description.trim(),
      price: numericPrice,
      comparePrice: numericComparePrice,
      category: category.trim(),
      tags: parseTags(tags),
      sku: sku?.trim() || "",
      ...(creationRequestId ? { creationRequestId } : {}),
      images: uploadedImages,
      video: uploadedVideos[0] || { url: "", publicId: "" },
      videos: uploadedVideos,
      whatsappNumber:
        whatsappNumber?.trim() || "",
      whatsappMessage:
        whatsappMessage?.trim() || "",
      createdBy: req.user._id,
    });
    createdProduct = product;

    const uploadedProductVideo = uploadedVideos[0];
    const postMedia = uploadedProductVideo
      ? { ...uploadedProductVideo, resourceType: "video" }
      : { ...uploadedImages[0], resourceType: "image" };
    const socialContent = await Content.create({
      product: product._id,
      type: uploadedProductVideo ? "reel" : "post",
      platform: "all",
      caption: createProductSocialCaption(product, process.env.FRONTEND_URL || ""),
      media: postMedia,
      generatedAutomatically: true,
      audioMode: uploadedProductVideo ? "original" : "none",
      status: "approved",
      createdBy: req.user._id,
    });

    try {
      await ensureAutomaticScheduleForContent(socialContent);
    } catch (scheduleError) {
      console.error("Product saved; automatic scheduling will retry in the background:", scheduleError.message);
    }

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    if (error.code === 11000 && creationRequestId) {
      const existingRequest = await Product.findOne({ creationRequestId })
        .select("_id name slug price images video videos")
        .lean();
      if (existingRequest) {
        await Promise.all(uploadedImages.map((image) => deleteFromCloudinary(image.publicId)));
        await Promise.all(uploadedVideos.map((video) => deleteFromCloudinary(video.publicId, "video")));
        return res.status(200).json({ success: true, message: "Product was already saved.", product: existingRequest });
      }
    }
    if (createdProduct) {
      await Product.findByIdAndDelete(createdProduct._id);
    }
    await Promise.all(uploadedImages.map((image) => deleteFromCloudinary(image.publicId)));
    await Promise.all(uploadedVideos.map((video) => deleteFromCloudinary(video.publicId, "video")));
    console.error(
      "Create Product Error:",
      error
    );

    res.status(error.status || 500).json({
      success: false,
      message:
        error.message || "Failed to create product",
    });
  }
};

// =====================================
// GET ALL PRODUCTS
// =====================================

const getProducts = async (req, res) => {
  try {
    const {
      search = "",
      category = "",
      status = "all",
    } = req.query;

    const query = {};
    query.deletedAt = null;

    if (search.trim()) {
      query.$or = [
        {
          name: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          description: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          category: {
            $regex: search.trim(),
            $options: "i",
          },
        },
      ];
    }

    if (category.trim()) {
      query.category = category.trim();
    }

    if (status === "active") {
      query.isActive = true;
    }

    if (status === "inactive") {
      query.isActive = false;
    }

    const products = await Product.find(query)
      .populate(
        "createdBy",
        "name email"
      )
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error(
      "Get Products Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to get products",
    });
  }
};

// =====================================
// GET SINGLE PRODUCT
// =====================================

const getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product =
      await Product.findOne({ _id: id, deletedAt: null }).populate(
        "createdBy",
        "name email"
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error(
      "Get Product Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to get product",
    });
  }
};

// =====================================
// UPDATE PRODUCT
// =====================================

const updateProduct = async (req, res) => {
  const newlyAddedDirectVideos = [];
  try {
    const { id } = req.params;

    const product =
      await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const imagesToDeleteAfterSave = [];

    const {
      name,
      description,
      price,
      comparePrice,
      category,
      sku,
      whatsappNumber,
      whatsappMessage,
      isActive,
      keepImages,
      keepVideo,
      keepVideos,
      tags,
    } = req.body;

    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 180)) {
      return res.status(400).json({ success: false, message: "Product name must be between 1 and 180 characters." });
    }
    if (description !== undefined && (typeof description !== "string" || !description.trim() || description.length > 10000)) {
      return res.status(400).json({ success: false, message: "Description must be between 1 and 10000 characters." });
    }
    if (category !== undefined && (typeof category !== "string" || !category.trim() || category.length > 100)) {
      return res.status(400).json({ success: false, message: "Category must be between 1 and 100 characters." });
    }
    if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
      return res.status(400).json({ success: false, message: "Price must be a non-negative amount." });
    }
    if (comparePrice !== undefined && (!Number.isFinite(Number(comparePrice)) || Number(comparePrice) < 0)) {
      return res.status(400).json({ success: false, message: "Compare price must be a non-negative amount." });
    }
    if ((sku !== undefined && (typeof sku !== "string" || sku.length > 80)) ||
        (whatsappNumber !== undefined && (typeof whatsappNumber !== "string" || whatsappNumber.length > 32)) ||
        (whatsappMessage !== undefined && (typeof whatsappMessage !== "string" || whatsappMessage.length > 1000))) {
      return res.status(400).json({ success: false, message: "SKU or WhatsApp fields have invalid values." });
    }

    if (name !== undefined) {
      product.name = name.trim();
    }

    if (description !== undefined) {
      product.description =
        description.trim();
    }

    if (price !== undefined) {
      product.price = Number(price);
    }

    if (comparePrice !== undefined) {
      product.comparePrice =
        Number(comparePrice);
    }

    if (category !== undefined) {
      product.category =
        category.trim();
    }
    if (tags !== undefined) {
      product.tags = parseTags(tags);
    }

    if (sku !== undefined) {
      product.sku = sku.trim();
    }

    if (whatsappNumber !== undefined) {
      product.whatsappNumber =
        whatsappNumber.trim();
    }

    if (whatsappMessage !== undefined) {
      product.whatsappMessage =
        whatsappMessage.trim();
    }

    if (isActive !== undefined) {
      product.isActive =
        isActive === true ||
        isActive === "true";
    }

    if (name !== undefined) {
      let newSlug = createSlug(name);

      const slugExists =
        await Product.findOne({
          slug: newSlug,
          _id: { $ne: id },
        });

      if (slugExists) {
        newSlug = `${newSlug}-${Date.now()}`;
      }

      product.slug = newSlug;
    }

    // ================================
    // REMOVE OLD IMAGES
    // ================================

    if (keepImages !== undefined || req.body.existingImages !== undefined) {
      let imagesToKeep = [];

      try {
        imagesToKeep =
          typeof (keepImages ?? req.body.existingImages) === "string"
            ? JSON.parse(keepImages ?? req.body.existingImages)
            : (keepImages ?? req.body.existingImages);
      } catch {
        imagesToKeep = [];
      }

      const oldImages = product.images;

      const imagesToDelete =
        oldImages.filter(
          (oldImage) =>
            !imagesToKeep.some(
              (keepImage) =>
                keepImage.publicId ===
                oldImage.publicId
            )
        );

      imagesToDeleteAfterSave.push(...imagesToDelete);

      product.images = oldImages.filter(
        (oldImage) =>
          imagesToKeep.some(
            (keepImage) =>
              keepImage.publicId ===
              oldImage.publicId
          )
      );
    }

    // ================================
    // ADD NEW IMAGES
    // ================================

    const files = req.files || {};
    const imageFiles = files.images || [];
    const videoFile = files.video?.[0];
    const uploadedVideoFiles = files.videos || [];
    const directVideoAssets = parseUploadedVideoAssets(req.body.videoAssets);
    if (imageFiles.some((file) => !file.mimetype?.startsWith("image/")) ||
        uploadedVideoFiles.some((file) => !file.mimetype?.startsWith("video/")) ||
        (videoFile && !videoFile.mimetype?.startsWith("video/"))) {
      return res.status(400).json({ success: false, message: "Upload valid product photo and video files." });
    }
    if (imageFiles.length > 0) {
      for (const file of imageFiles) {
        const result =
          await uploadToCloudinary(
            file.buffer
          );

        product.images.push({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    }

    if (keepVideo === "false" && product.video?.publicId) {
      imagesToDeleteAfterSave.push({ publicId: product.video.publicId, resourceType: "video" });
      product.video = { url: "", publicId: "" };
    }
    if (videoFile) {
      if (product.video?.publicId) {
        imagesToDeleteAfterSave.push({ publicId: product.video.publicId, resourceType: "video" });
      }
      const result = await uploadToCloudinary(videoFile.buffer, "video");
      product.video = { url: result.secure_url, publicId: result.public_id };
    }

    if (keepVideos !== undefined) {
      let videosToKeep = [];
      try {
        videosToKeep = typeof keepVideos === "string" ? JSON.parse(keepVideos) : keepVideos;
      } catch {
        videosToKeep = [];
      }
      const oldVideos = [...(product.videos || [])];
      if (product.video?.url && !oldVideos.some((item) => item.url === product.video.url)) oldVideos.unshift(product.video);
      imagesToDeleteAfterSave.push(...oldVideos.filter((oldVideo) =>
        !videosToKeep.some((keepVideoItem) => keepVideoItem.publicId === oldVideo.publicId)
      ).map((item) => ({ ...item, resourceType: "video" })));
      product.videos = oldVideos.filter((oldVideo) =>
        videosToKeep.some((keepVideoItem) => keepVideoItem.publicId === oldVideo.publicId)
      );
      product.video = product.videos[0] || { url: "", publicId: "" };
    } else if (keepVideo === "false" && product.videos?.length) {
      imagesToDeleteAfterSave.push(...product.videos.map((item) => ({ ...item, resourceType: "video" })));
      product.videos = [];
    }
    for (const file of uploadedVideoFiles) {
      const result = await uploadToCloudinary(file.buffer, "video");
      product.videos.push({ url: result.secure_url, publicId: result.public_id });
      if (!product.video?.url) product.video = { url: result.secure_url, publicId: result.public_id };
    }
    if (product.videos.length + directVideoAssets.length > 2) {
      return res.status(400).json({ success: false, message: "A product can have up to 2 videos." });
    }
    for (const asset of directVideoAssets) {
      product.videos.push(asset);
      newlyAddedDirectVideos.push(asset);
      if (!product.video?.url) product.video = asset;
    }

    if (product.images.length === 0 && !product.video?.url && !product.videos?.length) {
      return res.status(400).json({
        success: false,
        message: "Product must have at least one image or video.",
      });
    }

    await product.save();

    for (const image of imagesToDeleteAfterSave) {
      await deleteFromCloudinary(image.publicId, image.resourceType || "image");
    }

    res.json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    await Promise.all(newlyAddedDirectVideos.map((video) => deleteFromCloudinary(video.publicId, "video")));
    console.error(
      "Update Product Error:",
      error
    );

    res.status(error.status || 500).json({
      success: false,
      message:
        error.message ||
        "Failed to update product",
    });
  }
};

// =====================================
// DELETE PRODUCT
// =====================================

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product =
      await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const [contentReference, orderReference] = await Promise.all([
      Content.exists({ product: product._id }),
      Order.exists({ product: product._id }),
    ]);
    if (contentReference || orderReference) {
      product.isActive = false;
      product.deletedAt = new Date();
      await product.save();
      return res.json({
        success: true,
        deleted: true,
        message: "Product removed from product lists. Its order and content history has been kept.",
      });
    }

    await Product.findByIdAndDelete(id);

    for (const image of product.images) {
      await deleteFromCloudinary(
        image.publicId
      );
    }
    const videoPublicIds = new Set([
      product.video?.publicId,
      ...(product.videos || []).map((video) => video.publicId),
    ].filter(Boolean));
    for (const publicId of videoPublicIds) await deleteFromCloudinary(publicId, "video");

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete Product Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
};

// =====================================
// TOGGLE PRODUCT STATUS
// =====================================

const toggleProductStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const product =
      await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    product.isActive =
      !product.isActive;

    await product.save();

    res.json({
      success: true,
      message: product.isActive
        ? "Product activated"
        : "Product deactivated",
      product,
    });
  } catch (error) {
    console.error(
      "Toggle Product Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to change product status",
    });
  }
};

module.exports = {
  createProductUploadSignature,
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
};

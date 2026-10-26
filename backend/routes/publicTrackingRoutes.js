const express = require("express");
const mongoose = require("mongoose");
const Tracking = require("../models/Tracking");
const Analytics = require("../models/Analytics");
const Product = require("../models/Product");
const Content = require("../models/Content");

const router = express.Router();
const allowedPlatforms = ["facebook", "instagram", "tiktok", "website", "whatsapp", "other"];

async function updateAnalytics(platform, productId, contentId, field) {
  const filter = {
    platform,
    productId: productId || "",
    contentId: contentId || "",
  };
  let analytics = await Analytics.findOne(filter);
  if (!analytics) analytics = await Analytics.create(filter);
  analytics[field] = Number(analytics[field] || 0) + 1;
  await analytics.save();
}

const recordEvent = (type, field, defaultPlatform) => async (req, res) => {
  try {
    const { productId = "", contentId = "", source = "direct", platform = defaultPlatform } = req.body || {};
    if (typeof productId !== "string" || (productId && !mongoose.isValidObjectId(productId))) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }
    if (typeof contentId !== "string" || (contentId && !mongoose.isValidObjectId(contentId))) {
      return res.status(400).json({ success: false, message: "Invalid content ID." });
    }
    if (productId && !(await Product.exists({ _id: productId }))) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    if (contentId && !(await Content.exists({ _id: contentId }))) {
      return res.status(404).json({ success: false, message: "Content not found." });
    }
    if (typeof source !== "string" || source.length > 64 || typeof platform !== "string" || !allowedPlatforms.includes(platform)) {
      return res.status(400).json({ success: false, message: "Invalid tracking source or platform." });
    }

    await Tracking.create({
      type,
      productId,
      contentId,
      source,
      platform,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 512),
      ip: String(req.ip || "").slice(0, 64),
    });
    await updateAnalytics(platform, productId, contentId, field);
    return res.json({ success: true, message: `${type} tracked` });
  } catch (error) {
    console.error("Tracking event error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to record tracking event." });
  }
};

router.post("/view", recordEvent("view", "views", "website"));
router.post("/click", recordEvent("click", "clicks", "website"));
router.post("/whatsapp", recordEvent("whatsapp", "whatsappClicks", "whatsapp"));
router.post("/buy-now", recordEvent("buy-now", "buyNowClicks", "website"));

module.exports = router;

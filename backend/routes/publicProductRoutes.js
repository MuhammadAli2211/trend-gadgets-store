const express = require("express");
const Product = require("../models/Product");

const router = express.Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 40;
const ACTIVE_PRODUCTS = { isActive: true, deletedAt: null };
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/", async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
    const search = String(req.query.search || "").trim().slice(0, 100);
    const category = String(req.query.category || "").trim().slice(0, 80);
    const filter = { ...ACTIVE_PRODUCTS };

    if (category) filter.category = new RegExp("^" + escapeRegex(category) + "$", "i");
    if (search) {
      const expression = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: expression }, { category: expression }, { description: expression }];
    }

    res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");

    const [products, total, categories] = await Promise.all([
      Product.find(filter)
        .select("name slug description price comparePrice category tags images video videos createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
      Product.distinct("category", ACTIVE_PRODUCTS),
    ]);

    res.json({
      success: true,
      products,
      total,
      limit,
      offset,
      hasMore: offset + products.length < total,
      categories: categories.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    console.error("Public products list error:", error);
    res.status(500).json({ success: false, message: "Failed to load products" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    const product = await Product.findOne({ _id: req.params.id, ...ACTIVE_PRODUCTS })
      .select("name slug description price comparePrice category tags images video videos createdAt")
      .lean();

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, product });
  } catch (error) {
    console.error("Public product detail error:", error);
    res.status(500).json({ success: false, message: "Failed to load product" });
  }
});

module.exports = router;

const express = require("express");
const Product = require("../models/Product");

const router = express.Router();

// Get all active products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({
      isActive: true,
      deletedAt: null,
    })
      .select("name slug description price comparePrice category tags images video videos createdAt")
      .sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to load products",
    });
  }
});

// Get single active product
router.get("/:id", async (req, res) => {
  try {
    const product =
      await Product.findOne({
        _id: req.params.id,
        isActive: true,
        deletedAt: null,
      }).select("name slug description price comparePrice category tags images video videos createdAt");

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
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to load product",
    });
  }
});

module.exports = router;

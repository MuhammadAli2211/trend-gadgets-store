const express = require("express");

const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
  getOrderStats,
  getProductSales,
} = require("../controllers/orderController");

const {
  protect,
  adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ======================================================
// PUBLIC - CREATE ORDER
// ======================================================

router.post(
  "/",
  createOrder
);

// ======================================================
// ADMIN PROTECTION
// ======================================================

router.use(protect);
router.use(adminOnly);

// ======================================================
// ADMIN ORDERS
// ======================================================

router.get(
  "/",
  getOrders
);

// ======================================================
// ORDER STATS
// ======================================================

router.get(
  "/stats",
  getOrderStats
);

// ======================================================
// PRODUCT SALES
// ======================================================

router.get(
  "/product-sales",
  getProductSales
);

// ======================================================
// SINGLE ORDER
// ======================================================

router.get(
  "/:id",
  getOrderById
);

// ======================================================
// UPDATE STATUS
// ======================================================

router.put(
  "/:id/status",
  updateOrderStatus
);

// ======================================================
// DELETE
// ======================================================

router.delete(
  "/:id",
  deleteOrder
);

module.exports = router;
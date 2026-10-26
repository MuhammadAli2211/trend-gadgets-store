const express = require("express");

const {
  getUsers,
  getDashboardStats,
  toggleUserStatus,
  getWhatsAppSettings,
  updateWhatsAppSettings,
} = require("../controllers/adminController");

const {
  protect,
  adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(adminOnly);

// Users
router.get("/users", getUsers);

router.get(
  "/stats",
  getDashboardStats
);

router.put(
  "/users/:id/toggle-status",
  toggleUserStatus
);

// WhatsApp Settings
router.get(
  "/settings/whatsapp",
  getWhatsAppSettings
);

router.put(
  "/settings/whatsapp",
  updateWhatsAppSettings
);

module.exports = router;
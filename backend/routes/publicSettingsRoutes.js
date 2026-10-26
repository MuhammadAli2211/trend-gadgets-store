const express = require("express");

const {
  getWhatsAppSettings,
} = require("../controllers/publicSettingsController");

const router = express.Router();

router.get(
  "/whatsapp",
  getWhatsAppSettings
);

module.exports = router;
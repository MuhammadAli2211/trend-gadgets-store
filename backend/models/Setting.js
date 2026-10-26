const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    whatsappNumber: {
      type: String,
      default: process.env.WHATSAPP_NUMBER || "923442905070",
      trim: true,
    },

    whatsappMessage: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Setting",
  settingSchema
);

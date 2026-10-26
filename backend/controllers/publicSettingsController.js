const Setting = require("../models/Setting");

const getWhatsAppSettings = async (req, res) => {
  try {
    const setting = await Setting.findOne().lean();

    res.json({
      success: true,
      settings: {
        whatsappNumber:
          setting?.whatsappNumber || "92344295070",

        whatsappMessage:
          setting?.whatsappMessage || "",
      },
    });
  } catch (error) {
    console.error(
      "Get Public WhatsApp Settings Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to get WhatsApp settings",
    });
  }
};

module.exports = {
  getWhatsAppSettings,
};

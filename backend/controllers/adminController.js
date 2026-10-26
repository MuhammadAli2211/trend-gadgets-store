const User = require("../models/User");
const Setting = require("../models/Setting");

// =========================
// GET USERS
// =========================

const getUsers = async (req, res) => {
  try {
    const users = await User.find({
      role: "user",
    })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Get Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get users",
    });
  }
};

// =========================
// DASHBOARD STATS
// =========================

const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({
      role: "user",
    });

    const activeUsers = await User.countDocuments({
      role: "user",
      isActive: true,
    });

    const inactiveUsers = await User.countDocuments({
      role: "user",
      isActive: false,
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        inactiveUsers,
      },
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get dashboard statistics",
    });
  }
};

// =========================
// TOGGLE USER STATUS
// =========================

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({
      _id: id,
      role: "user",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isActive = !user.isActive;

    await user.save();

    res.json({
      success: true,
      message: user.isActive
        ? "User activated successfully"
        : "User disabled successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("Toggle User Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update user",
    });
  }
};

// =========================
// GET WHATSAPP SETTINGS
// =========================

const getWhatsAppSettings = async (req, res) => {
  try {
    let setting = await Setting.findOne();

    if (!setting) {
      setting = await Setting.create({
        whatsappNumber: process.env.WHATSAPP_NUMBER || "923442905070",
        whatsappMessage: "",
      });
    }

    res.json({
      success: true,
      settings: {
        whatsappNumber: setting.whatsappNumber || process.env.WHATSAPP_NUMBER || "923442905070",
        whatsappMessage: setting.whatsappMessage,
      },
    });
  } catch (error) {
    console.error(
      "Get WhatsApp Settings Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to get WhatsApp settings",
    });
  }
};

// =========================
// UPDATE WHATSAPP SETTINGS
// =========================

const updateWhatsAppSettings = async (
  req,
  res
) => {
  try {
    let {
      whatsappNumber,
      whatsappMessage,
    } = req.body;

    whatsappNumber =
      String(whatsappNumber || "")
        .replace(/\D/g, "")
        .trim();

    whatsappMessage =
      String(whatsappMessage || "").trim();

    if (!whatsappNumber) {
      return res.status(400).json({
        success: false,
        message:
          "WhatsApp number is required",
      });
    }

    let setting = await Setting.findOne();

    if (!setting) {
      setting = new Setting();
    }

    setting.whatsappNumber =
      whatsappNumber;

    setting.whatsappMessage =
      whatsappMessage;

    await setting.save();

    res.json({
      success: true,
      message:
        "WhatsApp settings updated successfully",
      settings: {
        whatsappNumber:
          setting.whatsappNumber,
        whatsappMessage:
          setting.whatsappMessage,
      },
    });
  } catch (error) {
    console.error(
      "Update WhatsApp Settings Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to update WhatsApp settings",
    });
  }
};

// =========================
// EXPORTS
// =========================

module.exports = {
  getUsers,
  getDashboardStats,
  toggleUserStatus,
  getWhatsAppSettings,
  updateWhatsAppSettings,
};

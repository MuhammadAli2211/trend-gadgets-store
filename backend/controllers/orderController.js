const Order = require("../models/Order");
const Analytics = require("../models/Analytics");

// ======================================================
// CREATE ORDER
// ======================================================

const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerAddress,
      productId,
      quantity,
      source,
      contentId,
      notes,
    } = req.body;

    if (typeof customerName !== "string" || !customerName.trim() || customerName.trim().length > 120) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required.",
      });
    }

    if (typeof customerPhone !== "string" || !customerPhone.trim() || customerPhone.trim().length > 40) {
      return res.status(400).json({
        success: false,
        message: "Customer phone is required.",
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    if (customerAddress !== undefined && (typeof customerAddress !== "string" || customerAddress.length > 500)) {
      return res.status(400).json({ success: false, message: "Address must be 500 characters or fewer." });
    }
    if (notes !== undefined && (typeof notes !== "string" || notes.length > 1000)) {
      return res.status(400).json({ success: false, message: "Notes must be 1000 characters or fewer." });
    }

    const orderQuantity = quantity === undefined ? 1 : Number(quantity);
    if (!Number.isSafeInteger(orderQuantity) || orderQuantity < 1 || orderQuantity > 100) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a whole number between 1 and 100.",
      });
    }

    const allowedSources = ["website", "facebook", "instagram", "whatsapp", "tiktok", "other"];
    const orderSource = source || "website";
    if (!allowedSources.includes(orderSource)) {
      return res.status(400).json({ success: false, message: "Invalid order source." });
    }

    const product = await Product.findOne({ _id: productId, isActive: true });

    if (!product) {
      const existingProduct = await Product.exists({ _id: productId, isActive: true });
      return res.status(existingProduct ? 409 : 404).json({
        success: false,
        message: "Active product not found.",
      });
    }

    const productPrice =
      Number(product.price) || 0;

    const totalAmount =
      productPrice * orderQuantity;

    const order = await Order.create({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress:
        customerAddress?.trim() || "",
      product: product._id,
      productName: product.name || "",
      quantity: orderQuantity,
      price: productPrice,
      totalAmount,
      source: orderSource,
      contentId: contentId || "",
      notes: notes?.trim() || "",
      });

    // ----------------------------------------------
    // ANALYTICS
    // ----------------------------------------------

    try {
      const platform =
        source || "website";

      let analytics =
        await Analytics.findOne({
          platform,
          productId:
            product._id.toString(),
          contentId:
            contentId || "",
        });

      if (!analytics) {
        analytics = await Analytics.create({
          platform,
          productId:
            product._id.toString(),
          contentId:
            contentId || "",
        });
      }

      analytics.buyNowClicks =
        Number(
          analytics.buyNowClicks || 0
        ) + 1;

      await analytics.save();
    } catch (analyticsError) {
      console.log(
        "Order analytics warning:",
        analyticsError.message
      );
    }

    return res.status(201).json({
      success: true,
      message:
        "Order created successfully.",
      order,
    });
  } catch (error) {
    console.error(
      "Create order error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// GET ALL ORDERS
// ======================================================

const getOrders = async (req, res) => {
  try {
    const {
      status,
      search,
    } = req.query;

    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        {
          customerName: {
            $regex: search,
            $options: "i",
          },
        },
        {
          customerPhone: {
            $regex: search,
            $options: "i",
          },
        },
        {
          productName: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const orders =
      await Order.find(filter)
        .populate(
          "product",
          "name price images category"
        )
        .sort({
          createdAt: -1,
        });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error(
      "Get orders error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// GET SINGLE ORDER
// ======================================================

const getOrderById = async (
  req,
  res
) => {
  try {
    const order =
      await Order.findById(
        req.params.id
      ).populate(
        "product",
        "name price images category"
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// UPDATE ORDER STATUS
// ======================================================

const updateOrderStatus = async (
  req,
  res
) => {
  try {
    const {
      status,
    } = req.body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid order status.",
      });
    }

      const existingOrder = await Order.findById(req.params.id);

      if (!existingOrder) {
        return res.status(404).json({ success: false, message: "Order not found." });
      }

      if (existingOrder.status === "cancelled" && status !== "cancelled") {
        return res.status(400).json({ success: false, message: "Cancelled orders cannot be reopened." });
      }

      let order;
      if (status === "cancelled") {
        order = await Order.findOneAndUpdate(
          { _id: req.params.id, status: { $ne: "cancelled" } },
          { $set: { status } },
          { new: true, runValidators: true }
        );
        if (!order) {
          order = existingOrder;
        }
        await order.populate("product", "name price images category");
      } else {
        order = await Order.findByIdAndUpdate(
          req.params.id,
          { $set: { status } },
          { new: true, runValidators: true }
        ).populate("product", "name price images category");
      }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.json({
      success: true,
      message:
        "Order status updated.",
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// DELETE ORDER
// ======================================================

const deleteOrder = async (
  req,
  res
) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.json({
      success: true,
      message:
        "Order deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// ORDER STATISTICS
// ======================================================

const getOrderStats = async (
  req,
  res
) => {
  try {
    const [
      total,
      pending,
      confirmed,
      processing,
      shipped,
      delivered,
      cancelled,
    ] = await Promise.all([
      Order.countDocuments(),

      Order.countDocuments({
        status: "pending",
      }),

      Order.countDocuments({
        status: "confirmed",
      }),

      Order.countDocuments({
        status: "processing",
      }),

      Order.countDocuments({
        status: "shipped",
      }),

      Order.countDocuments({
        status: "delivered",
      }),

      Order.countDocuments({
        status: "cancelled",
      }),
    ]);

    const revenueResult =
      await Order.aggregate([
        {
          $match: {
            status: {
              $ne: "cancelled",
            },
          },
        },
        {
          $group: {
            _id: null,
            revenue: {
              $sum: "$totalAmount",
            },
          },
        },
      ]);

    const revenue =
      revenueResult[0]?.revenue || 0;

    return res.json({
      success: true,
      stats: {
        total,
        pending,
        confirmed,
        processing,
        shipped,
        delivered,
        cancelled,
        revenue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// PRODUCT SALES
// ======================================================

const getProductSales = async (
  req,
  res
) => {
  try {
    const sales =
      await Order.aggregate([
        {
          $match: {
            status: {
              $ne: "cancelled",
            },
          },
        },

        {
          $group: {
            _id: "$product",

            productName: {
              $first:
                "$productName",
            },

            orders: {
              $sum: 1,
            },

            quantity: {
              $sum: "$quantity",
            },

            revenue: {
              $sum:
                "$totalAmount",
            },
          },
        },

        {
          $sort: {
            revenue: -1,
          },
        },
      ]);

    return res.json({
      success: true,
      sales,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
  getOrderStats,
  getProductSales,
};

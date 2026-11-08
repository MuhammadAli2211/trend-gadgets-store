require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const publicProductRoutes = require("./routes/publicProductRoutes");
const contentRoutes = require("./routes/contentRoutes");
const socialRoutes = require("./routes/socialRoutes");
const scheduleRoutes = require("./routes/scheduleRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const publicTrackingRoutes = require("./routes/publicTrackingRoutes");
const publicSettingsRoutes = require("./routes/publicSettingsRoutes");
const orderRoutes = require("./routes/orderRoutes");
const audienceGrowthRoutes = require("./routes/audienceGrowthRoutes");

const {
  startScheduleWorker,
} = require("./workers/scheduleWorker");
const {
  processDueSchedules,
} = require("./services/publishService");

const app = express();

const PORT =
  process.env.PORT || 5000;

const isVercel = Boolean(process.env.VERCEL);
let databaseConnectionPromise = null;
mongoose.connection.on("disconnected", () => {
  databaseConnectionPromise = null;
});

// =========================
// CORS
// =========================

const allowedOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    "https://trend-gadgets-storefront.netlify.app",
    "http://localhost:3000",
  ]
    .filter(Boolean)
    .map((origin) => origin.trim().replace(/\/+$/, ""))
);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header are server-to-server or direct health checks.
      const normalizedOrigin = origin?.trim().replace(/\/+$/, "");
      if (!normalizedOrigin || allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  })
);

// =========================
// BODY PARSER
// =========================

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Vercel starts a new function when a request arrives. Connect to MongoDB
// before protected API routes run, while reusing the connection in warm runs.
const connectDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  // A cached resolved promise must not make a disconnected warm serverless
  // instance appear healthy. Recreate it whenever Mongoose is disconnected.
  if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    databaseConnectionPromise = null;
  }

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not configured.");
    return false;
  }

  if (!databaseConnectionPromise) {
    databaseConnectionPromise = mongoose
      .connect(process.env.MONGO_URI)
      .then(() => {
        console.log("MongoDB connected successfully");
        return true;
      })
      .catch((error) => {
        databaseConnectionPromise = null;
        console.error("MongoDB connection failed:", error.message);
        return false;
      });
  }

  return databaseConnectionPromise;
};

app.use(async (req, res, next) => {
  const databaseConnected = await connectDatabase();
  if (!databaseConnected) {
    return res.status(503).json({
      success: false,
      message: "Database is unavailable.",
    });
  }
  return next();
});

// =========================
// ROOT
// =========================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message:
      "Ecommerce Automation API is running",
  });
});

// =========================
// HEALTH
// =========================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is healthy",
    deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// Called by the protected Cloudflare Worker. Keeping the secret out of the URL prevents anyone
// from triggering the publisher directly.
app.get("/api/cron/process-schedules", async (req, res) => {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = req.get("authorization") || "";
  const authorizationMatches =
    Boolean(expectedSecret) && authorization === `Bearer ${expectedSecret}`;

  if (!authorizationMatches) {
    // Safe diagnostics only: never log the secret or the Authorization header.
    console.warn("[CRON_AUTH_DIAGNOSTIC]", {
      secretConfigured: Boolean(expectedSecret),
      authorizationHeaderPresent: Boolean(authorization),
      bearerPrefixPresent: authorization.startsWith("Bearer "),
      authorizationMatches,
    });
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }

  try {
    const result = await processDueSchedules();
    if (result.message === "Another schedule worker is already running.") {
      return res.status(409).json({ success: false, ...result });
    }
    const platformFailures = (result.schedules || []).flatMap((schedule) =>
      (schedule.results || [])
        .filter((platformResult) => !platformResult.success)
        .map((platformResult) => ({
          scheduleId: schedule.id,
          platform: platformResult.platform,
          error: platformResult.error,
        }))
    );
    return res.status(platformFailures.length ? 502 : 200).json({
      success: platformFailures.length === 0,
      message: platformFailures.length
        ? "One or more social platforms failed. Failed platform details are included."
        : "Due schedules checked.",
      ...result,
      platformFailures,
    });
  } catch (error) {
    console.error("Vercel schedule cron error:", error);
    return res.status(500).json({ success: false, message: "Unable to process schedules." });
  }
});

// Daily audience-growth tasks run in the same protected Vercel function
// environment; they do not publish social posts or send messages.
app.get("/api/cron/audience-growth", async (req, res) => {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = req.get("authorization") || "";

  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }

  try {
    const result = await audienceGrowthRoutes.runDailyAudienceGrowth();
    return res.status(200).json({
      message: result.skipped ? result.reason : "Daily audience-growth tasks checked.",
      ...result,
    });
  } catch (error) {
    console.error("Vercel audience-growth cron error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to run daily audience-growth tasks." });
  }
});

// =========================
// ROUTES
// =========================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/content",
  contentRoutes
);

app.use(
  "/api/products",
  productRoutes
);

app.use(
  "/api/public/products",
  publicProductRoutes
);

app.use(
  "/api/social-accounts",
  socialRoutes
);

app.use(
  "/api/schedules",
  scheduleRoutes
);

app.use(
  "/api/analytics",
  analyticsRoutes
);

app.use(
  "/api/public/tracking",
  publicTrackingRoutes
);
app.use(
  "/api/public/settings",
  publicSettingsRoutes
);
app.use(
  "/api/orders",
  orderRoutes
);

app.use(
  "/api/audience-growth",
  audienceGrowthRoutes
);

// =========================
// 404
// =========================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// =========================
// ERROR HANDLER
// =========================

app.use(
  (err, req, res, next) => {
    console.error(
      "Server Error:",
      err
    );

    const statusCode = err.status || err.statusCode || (err.code === "LIMIT_FILE_SIZE" ? 413 : err.code?.startsWith("LIMIT_") ? 400 : 500);
    res.status(statusCode).json({
      success: false,
      message:
        statusCode >= 500
          ? "Internal server error"
          : err.message || "Invalid request",
    });
  }
);

// =========================
// DATABASE
// =========================

// =========================
// START SERVER
// =========================

const startServer =
  async () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === "change_this_to_a_long_random_secret") {
      throw new Error("JWT_SECRET must be configured with a random value of at least 32 characters.");
    }

    const databaseConnected =
      await connectDatabase();

    if (!databaseConnected) {
      throw new Error("MongoDB connection failed; backend startup was stopped.");
    }

    app.listen(
      PORT,
      () => {
        console.log(
          `Backend running on http://localhost:${PORT}`
        );

        console.log(
          "Cloudinary Cloud Name:",
          process.env
            .CLOUDINARY_CLOUD_NAME
            ? "Loaded"
            : "Missing"
        );

        console.log(
          "Cloudinary API Key:",
          process.env
            .CLOUDINARY_API_KEY
            ? "Loaded"
            : "Missing"
        );

        console.log(
          "Cloudinary API Secret:",
          process.env
            .CLOUDINARY_API_SECRET
            ? "Loaded"
            : "Missing"
        );

        if (!isVercel) {
          startScheduleWorker();
        }
      }
    );
  };

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.connectDatabase = connectDatabase;

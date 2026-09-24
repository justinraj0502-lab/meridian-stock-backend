const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const stockRoutes = require("./routes/stockRoutes");
const portfolioRoutes = require("./routes/portfolioRoutes");
const alertRoutes = require("./routes/alertRoutes");

const seedStocks = require("./services/seedStocks");

const {
  startLiveMarketUpdater,
} = require("./services/liveMarketService");

const {
  verifyEmailTransport,
} = require("./services/emailService");

const {
  loginToAngelOne,
  getSessionStatus,
  getAngelProfile,
} = require("./services/angelOneService");

dotenv.config();

const app = express();

/* =========================================
   MIDDLEWARE
========================================= */

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://meridian-stock-dashboard.netlify.app",
    ],
    credentials: true,
  })
);

app.use(express.json());

/* =========================================
   API ROUTES
========================================= */

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/users",
  userRoutes
);

app.use(
  "/api/stocks",
  stockRoutes
);

app.use(
  "/api/portfolio",
  portfolioRoutes
);

app.use(
  "/api/alerts",
  alertRoutes
);

/* =========================================
   HEALTH CHECK
========================================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      success: true,
      message:
        "Meridian API is running 🚀",
    });
  }
);

/* =========================================
   EMAIL STATUS CHECK
========================================= */

app.get(
  "/api/email-status",
  async (req, res) => {
    try {
      await verifyEmailTransport();

      res.status(200).json({
        success: true,
        message:
          "Email service is connected successfully",
      });
    } catch (error) {
      console.error(
        "Email status check failed:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Email service connection failed",
        error:
          error.code ||
          error.message,
      });
    }
  }
);

/* =========================================
   ANGEL ONE STATUS
========================================= */

app.get(
  "/api/angelone/status",
  async (req, res) => {
    try {
      const status =
        await getSessionStatus();

      res.status(200).json({
        success: true,
        ...status,
      });
    } catch (error) {
      console.error(
        "Angel One status error:",
        error.message
      );

      res.status(500).json({
        success: false,
        connected: false,
        message:
          error.message ||
          "Unable to check Angel One status",
      });
    }
  }
);

/* =========================================
   ANGEL ONE CONNECTION TEST
========================================= */

app.get(
  "/api/angelone/test",
  async (req, res) => {
    try {
      console.log(
        "🔐 Testing Angel One SmartAPI connection..."
      );

      const result =
        await loginToAngelOne();

      res.status(200).json({
        success: true,
        message:
          "Angel One SmartAPI connected successfully 🚀",
        connected: true,
        clientCode:
          process.env.ANGELONE_CLIENT_CODE,
        data: result.data
          ? {
              feedToken:
                result.data.feedToken
                  ? "Available"
                  : "Not available",

              jwtToken:
                result.data.jwtToken
                  ? "Available"
                  : "Not available",

              refreshToken:
                result.data.refreshToken
                  ? "Available"
                  : "Not available",
            }
          : null,
      });
    } catch (error) {
      console.error(
        "❌ Angel One connection test failed:",
        error.message
      );

      res.status(500).json({
        success: false,
        connected: false,
        message:
          "Angel One SmartAPI connection failed",
        error:
          error.message ||
          "Unknown Angel One error",
      });
    }
  }
);

/* =========================================
   ANGEL ONE PROFILE TEST
========================================= */

app.get(
  "/api/angelone/profile",
  async (req, res) => {
    try {
      const profile =
        await getAngelProfile();

      res.status(200).json({
        success: true,
        message:
          "Angel One profile retrieved successfully",
        data: profile,
      });
    } catch (error) {
      console.error(
        "❌ Angel One profile error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to retrieve Angel One profile",
        error:
          error.message ||
          "Unknown Angel One error",
      });
    }
  }
);

/* =========================================
   MONGODB
========================================= */

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log(
      "✅ MongoDB connected successfully"
    );

    await seedStocks();

    console.log(
      "🌱 Stock database ready"
    );

    /*
     * Email verification is performed
     * after the server starts so that
     * email problems cannot delay the
     * Render health check.
     */

    setTimeout(async () => {
      console.log(
        "📧 Checking email service connection..."
      );

      try {
        await verifyEmailTransport();

        console.log(
          "✅ Email service is ready"
        );
      } catch (emailError) {
        console.error(
          "❌ Email service check failed"
        );

        console.error(
          "Error code:",
          emailError.code ||
            "UNKNOWN"
        );

        console.error(
          "Error message:",
          emailError.message
        );

        console.error(
          "Command:",
          emailError.command ||
            "N/A"
        );

        console.error(
          "Response code:",
          emailError.responseCode ||
            "N/A"
        );
      }
    }, 3000);

    /*
     * Start market updater separately.
     */

    startLiveMarketUpdater();

  } catch (error) {
    console.error(
      "❌ MongoDB connection failed:",
      error.message
    );

    process.exit(1);
  }
};

connectDB();

/* =========================================
   SERVER
========================================= */

const PORT =
  process.env.PORT || 5000;

app.listen(
  PORT,
  () => {
    console.log(
      `🚀 Meridian server running on http://localhost:${PORT}`
    );

    console.log(
      "🌐 CORS enabled for production frontend"
    );
  }
);
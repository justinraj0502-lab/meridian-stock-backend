const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const stockRoutes = require("./routes/stockRoutes");
const portfolioRoutes = require("./routes/portfolioRoutes");

const seedStocks = require("./services/seedStocks");

const {
  startLiveMarketUpdater,
} = require("./services/liveMarketService");

const {
  verifyEmailTransport,
} = require("./services/emailService");

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
     * Gmail verification is performed
     * after the server starts so that
     * SMTP problems cannot delay the
     * Render health check.
     */

    setTimeout(async () => {
      console.log(
        "📧 Checking Gmail SMTP connection..."
      );

      try {
        await verifyEmailTransport();

        console.log(
          "✅ Gmail SMTP is ready"
        );
      } catch (emailError) {
        console.error(
          "❌ Gmail SMTP check failed"
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
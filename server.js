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
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(
  express.json()
);

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
     * Verify Gmail SMTP before
     * starting the application services.
     */
    try {
      await verifyEmailTransport();
    } catch (emailError) {
      console.error(
        "⚠️ Email service connection failed:",
        emailError.message
      );

      console.error(
        "⚠️ Check EMAIL_USER and EMAIL_APP_PASSWORD in .env"
      );
    }

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
  }
);
const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    /* =====================================================
       USER
       ===================================================== */

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* =====================================================
       STOCK
       ===================================================== */

    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    /* =====================================================
       ALERT CONDITION
       ===================================================== */

    type: {
      type: String,
      enum: ["Above", "Below"],
      required: true,
    },

    target: {
      type: Number,
      required: true,
      min: 0,
    },

    /* =====================================================
       MARKET SNAPSHOT
       ===================================================== */

    current: {
      type: Number,
      default: 0,
      min: 0,
    },

    dataSource: {
      type: String,
      default: "Angel One SmartAPI",
      trim: true,
    },

    isLive: {
      type: Boolean,
      default: false,
    },

    isMarketOpen: {
      type: Boolean,
      default: false,
    },

    lastUpdated: {
      type: Date,
      default: null,
    },

    /* =====================================================
       STATUS
       ===================================================== */

    triggered: {
      type: Boolean,
      default: false,
    },

    triggeredAt: {
      type: Date,
      default: null,
    },

    /* =====================================================
       ALERT LIFECYCLE
       ===================================================== */

    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    notificationSent: {
      type: Boolean,
      default: false,
    },

    notificationSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


/* =========================================================
   INDEXES
   ========================================================= */

alertSchema.index({
  user: 1,
  createdAt: -1,
});

alertSchema.index({
  user: 1,
  active: 1,
});

alertSchema.index({
  symbol: 1,
  active: 1,
});


/* =========================================================
   MODEL
   ========================================================= */

module.exports = mongoose.model(
  "Alert",
  alertSchema
);
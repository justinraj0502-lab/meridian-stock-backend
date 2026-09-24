const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    previousClose: {
      type: Number,
      required: true,
      min: 0,
    },

    change: {
      type: Number,
      default: 0,
    },

    changePercent: {
      type: Number,
      default: 0,
    },

    open: {
      type: Number,
      default: 0,
    },

    high: {
      type: Number,
      default: 0,
    },

    low: {
      type: Number,
      default: 0,
    },

    volume: {
      type: Number,
      default: 0,
    },

    marketCap: {
      type: Number,
      default: 0,
    },

    sector: {
      type: String,
      default: "Other",
      trim: true,
    },

    exchange: {
      type: String,
      default: "NSE",
      uppercase: true,
      trim: true,
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    dataSource: {
      type: String,
      default: "Seed",
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
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Stock", stockSchema);
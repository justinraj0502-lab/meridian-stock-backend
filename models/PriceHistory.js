const mongoose = require("mongoose");

const priceHistorySchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    source: {
      type: String,
      default: "Twelve Data",
      trim: true,
    },

    capturedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

priceHistorySchema.index({
  symbol: 1,
  capturedAt: -1,
});

module.exports = mongoose.model(
  "PriceHistory",
  priceHistorySchema
);
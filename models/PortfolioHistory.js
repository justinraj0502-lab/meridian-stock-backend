const mongoose = require("mongoose");

const portfolioHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    totalInvested: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalProfitLoss: {
      type: Number,
      default: 0,
    },

    cashBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    holdingsValue: {
      type: Number,
      default: 0,
      min: 0,
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

portfolioHistorySchema.index({
  user: 1,
  capturedAt: -1,
});

module.exports = mongoose.model(
  "PortfolioHistory",
  portfolioHistorySchema
);
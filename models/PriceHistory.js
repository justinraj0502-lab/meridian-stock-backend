const mongoose = require("mongoose");

const priceHistorySchema =
  new mongoose.Schema(
    {
      /* =========================================
         STOCK SYMBOL
      ========================================= */

      symbol: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        index: true,
      },


      /* =========================================
         OHLC DATA
      ========================================= */

      open: {
        type: Number,
        default: null,
        min: 0,
      },

      high: {
        type: Number,
        default: null,
        min: 0,
      },

      low: {
        type: Number,
        default: null,
        min: 0,
      },

      close: {
        type: Number,
        default: null,
        min: 0,
      },


      /* =========================================
         LEGACY / LIVE SNAPSHOT PRICE

         Kept because the current live updater
         stores LTP snapshots using "price".
      ========================================= */

      price: {
        type: Number,
        required: true,
        min: 0,
      },


      /* =========================================
         VOLUME
      ========================================= */

      volume: {
        type: Number,
        default: 0,
        min: 0,
      },


      /* =========================================
         DATA SOURCE
      ========================================= */

      source: {
        type: String,
        default: "Angel One SmartAPI",
        trim: true,
      },


      /* =========================================
         TIMEFRAME

         "snapshot" = live LTP snapshot
         "1minute"  = 1-minute candle
         "5minute"  = 5-minute candle
         "15minute" = 15-minute candle
         "1hour"    = hourly candle
         "1day"     = daily candle
      ========================================= */

      interval: {
        type: String,
        default: "snapshot",
        trim: true,
      },


      /* =========================================
         CAPTURE TIME
      ========================================= */

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


/* =========================================
   INDEXES
========================================= */

priceHistorySchema.index({
  symbol: 1,
  capturedAt: -1,
});


priceHistorySchema.index({
  symbol: 1,
  interval: 1,
  capturedAt: -1,
});


/* =========================================
   MODEL
========================================= */

module.exports =
  mongoose.model(
    "PriceHistory",
    priceHistorySchema
  );
const axios = require("axios");
const Stock = require("../models/Stock");

const TWELVE_DATA_URL =
  "https://api.twelvedata.com/quote";

const REFRESH_INTERVAL =
  60 * 1000;

let lastRefreshTime = 0;
let refreshInProgress = false;

const refreshMarketData = async () => {
  const now = Date.now();

  /* ================================
     PREVENT DUPLICATE REFRESH
     ================================ */

  if (refreshInProgress) {
    return {
      success: true,
      skipped: true,
      message:
        "Refresh already in progress",
    };
  }

  /* ================================
     ONE REFRESH PER MINUTE
     ================================ */

  if (
    now - lastRefreshTime <
    REFRESH_INTERVAL
  ) {
    return {
      success: true,
      skipped: true,
      message:
        "Market data is already fresh",
    };
  }

  const apiKey =
    process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    console.warn(
      "⚠️ TWELVE_DATA_API_KEY is missing"
    );

    return {
      success: false,
      message:
        "Twelve Data API key is missing",
    };
  }

  refreshInProgress = true;
  lastRefreshTime = now;

  try {
    const stocks =
      await Stock.find().sort({
        symbol: 1,
      });

    if (!stocks.length) {
      return {
        success: false,
        message:
          "No stocks available",
      };
    }

    /*
      IMPORTANT

      Twelve Data Basic gives only limited
      international/NSE access.

      So we currently use INFY as the
      Twelve Data test stock.

      Other Indian stocks may return
      plan-restriction errors.
    */

    const stocksToUpdate =
      stocks.filter(
        (stock) =>
          stock.symbol === "INFY"
      );

    if (!stocksToUpdate.length) {
      return {
        success: false,
        message:
          "INFY stock not found",
      };
    }

    let updatedCount = 0;

    for (const stock of stocksToUpdate) {
      try {
        const response =
          await axios.get(
            TWELVE_DATA_URL,
            {
              params: {
                symbol: `${stock.symbol}:NSE`,
                apikey: apiKey,
              },

              timeout: 15000,
            }
          );

        const quote =
          response.data;

        if (
          !quote ||
          quote.status === "error"
        ) {
          console.error(
            `❌ ${stock.symbol}:`,
            quote?.message ||
              "Unknown API error"
          );

          continue;
        }

        const price =
          Number(quote.close);

        const previousClose =
          Number(
            quote.previous_close
          );

        if (
          !Number.isFinite(price) ||
          !Number.isFinite(
            previousClose
          )
        ) {
          console.error(
            `❌ Invalid price for ${stock.symbol}`
          );

          continue;
        }

        const change =
          Number(quote.change);

        const changePercent =
          Number(
            quote.percent_change
          );

        await Stock.findOneAndUpdate(
          {
            symbol:
              stock.symbol,
          },
          {
            price,

            previousClose,

            change:
              Number.isFinite(change)
                ? change
                : price -
                  previousClose,

            changePercent:
              Number.isFinite(
                changePercent
              )
                ? changePercent
                : ((price -
                    previousClose) /
                    previousClose) *
                  100,

            open: Number(
              quote.open || 0
            ),

            high: Number(
              quote.high || 0
            ),

            low: Number(
              quote.low || 0
            ),

            volume: Number(
              quote.volume || 0
            ),

            exchange:
              quote.exchange ||
              "NSE",

            currency:
              quote.currency ||
              "INR",

            isMarketOpen:
              Boolean(
                quote.is_market_open
              ),

            lastUpdated:
              new Date(),
          },

          {
            new: true,
          }
        );

        updatedCount++;

        console.log(
          `📈 ${stock.symbol}: ₹${price}`
        );
      } catch (error) {
        console.error(
          `❌ ${stock.symbol} update failed:`,
          error.response?.data ||
            error.message
        );
      }
    }

    console.log(
      `✅ Real market data updated: ${updatedCount}/${stocksToUpdate.length}`
    );

    return {
      success: true,
      updatedCount,
    };
  } finally {
    refreshInProgress =
      false;
  }
};

module.exports = {
  refreshMarketData,
};
const axios = require("axios");
const Stock = require("../models/Stock");
const PriceHistory = require("../models/PriceHistory");

const TWELVE_DATA_API_KEY =
  process.env.TWELVE_DATA_API_KEY;

const TWELVE_DATA_BASE_URL =
  "https://api.twelvedata.com";

const UPDATE_INTERVAL = 60 * 1000;

// Maximum provider requests per cycle.
// Twelve Data free plans are limited, so keep this conservative.
const MAX_REQUESTS_PER_CYCLE = 3;

// After a symbol is rejected by the provider,
// don't request it again for this long.
const RESTRICTED_COOLDOWN =
  30 * 60 * 1000;

// After hitting a rate limit, wait before trying again.
const RATE_LIMIT_COOLDOWN =
  5 * 60 * 1000;

// In-memory provider status
const restrictedSymbols = new Map();
const supportedSymbols = new Set();

let rateLimitedUntil = 0;
let updateRunning = false;

/**
 * Save one successful provider snapshot.
 */
const savePriceSnapshot = async (
  symbol,
  price,
  source = "Twelve Data"
) => {
  try {
    await PriceHistory.create({
      symbol,
      price,
      source,
      capturedAt: new Date(),
    });

    // Keep only the latest 1000 snapshots
    // for each symbol.
    const oldSnapshots =
      await PriceHistory.find({
        symbol,
      })
        .sort({
          capturedAt: -1,
        })
        .skip(1000)
        .select("_id")
        .lean();

    if (oldSnapshots.length > 0) {
      await PriceHistory.deleteMany({
        _id: {
          $in: oldSnapshots.map(
            (item) => item._id
          ),
        },
      });
    }
  } catch (error) {
    console.error(
      `Snapshot save error for ${symbol}:`,
      error.message
    );
  }
};

/**
 * Check whether a symbol is currently restricted.
 */
const isSymbolRestricted = (symbol) => {
  const restrictedUntil =
    restrictedSymbols.get(symbol);

  if (!restrictedUntil) {
    return false;
  }

  if (Date.now() >= restrictedUntil) {
    restrictedSymbols.delete(symbol);
    return false;
  }

  return true;
};

/**
 * Mark a symbol as temporarily unsupported.
 */
const markSymbolRestricted = (symbol) => {
  restrictedSymbols.set(
    symbol,
    Date.now() + RESTRICTED_COOLDOWN
  );
};

/**
 * Fetch one quote from Twelve Data.
 */
const fetchQuote = async (symbol) => {
  const response = await axios.get(
    `${TWELVE_DATA_BASE_URL}/quote`,
    {
      params: {
        symbol,
        apikey: TWELVE_DATA_API_KEY,
      },
      timeout: 10000,
    }
  );

  return response.data;
};

/**
 * Update one stock.
 */
const updateStock = async (stock) => {
  const symbol = stock.symbol;

  if (isSymbolRestricted(symbol)) {
    return {
      success: false,
      skipped: true,
      reason: "restricted",
    };
  }

  console.log(
    `📡 Fetching live quote: ${symbol}`
  );

  try {
    const data = await fetchQuote(symbol);

    if (
      data?.status === "error"
    ) {
      const message =
        data?.message ||
        "Provider returned an error";

      // Twelve Data returns this type of message
      // when the symbol is unavailable on the plan.
      if (
        message
          .toLowerCase()
          .includes("grow") ||
        message
          .toLowerCase()
          .includes("venture") ||
        message
          .toLowerCase()
          .includes("available")
      ) {
        console.log(
          `⚠️ ${symbol}: Provider does not support this symbol on current plan`
        );

        markSymbolRestricted(symbol);

        return {
          success: false,
          restricted: true,
        };
      }

      console.log(
        `⚠️ ${symbol}: ${message}`
      );

      return {
        success: false,
        error: message,
      };
    }

    const price = Number(
      data?.close
    );

    if (!Number.isFinite(price) || price <= 0) {
      console.log(
        `⚠️ ${symbol}: Invalid provider price`
      );

      return {
        success: false,
        error: "Invalid price",
      };
    }

    const previousClose =
      Number(data?.previous_close) ||
      Number(stock.previousClose) ||
      price;

    const change =
      price - previousClose;

    const changePercent =
      previousClose > 0
        ? (change / previousClose) * 100
        : 0;

    const open =
      Number(data?.open) || price;

    const high =
      Number(data?.high) || price;

    const low =
      Number(data?.low) || price;

    const volume =
      Number(data?.volume) || 0;

    await Stock.updateOne(
      {
        symbol,
      },
      {
        $set: {
          price,
          previousClose,
          change,
          changePercent,
          open,
          high,
          low,
          volume,
          dataSource: "Twelve Data",
          isLive: true,
          lastUpdated: new Date(),
        },
      }
    );

    await savePriceSnapshot(
      symbol,
      price,
      "Twelve Data"
    );
    supportedSymbols.add(symbol);

    console.log(
      `✅ ${symbol}: ₹${price} live snapshot saved`
    );

    return {
      success: true,
      symbol,
      price,
    };
  } catch (error) {
    const status =
      error?.response?.status;

    const providerMessage =
      error?.response?.data?.message;

    if (status === 429) {
      console.log(
        "⚠️ Twelve Data rate limit reached."
      );

      rateLimitedUntil =
        Date.now() +
        RATE_LIMIT_COOLDOWN;

      return {
        success: false,
        rateLimited: true,
      };
    }

    if (status === 401) {
      console.log(
        `⚠️ ${symbol}: Twelve Data authentication failed`
      );

      return {
        success: false,
        authenticationError: true,
      };
    }

    if (status === 404) {
      console.log(
        `⚠️ ${symbol}: Provider does not support this symbol`
      );

      markSymbolRestricted(symbol);

      return {
        success: false,
        restricted: true,
      };
    }

    console.log(
      `⚠️ ${symbol}: ${
        providerMessage ||
        error.message
      }`
    );

    return {
      success: false,
      error:
        providerMessage ||
        error.message,
    };
  }
};

/**
 * Run one market update cycle.
 */
const updateMarket = async () => {
  if (updateRunning) {
    console.log(
      "⏳ Previous market update is still running. Skipping cycle."
    );

    return;
  }

  if (Date.now() < rateLimitedUntil) {
    const remaining = Math.ceil(
      (rateLimitedUntil - Date.now()) /
        1000
    );

    console.log(
      `⏸️ Provider cooldown active. Next attempt in ${remaining}s.`
    );

    return;
  }

  updateRunning = true;

  try {
    const stocks = await Stock.find({})
  .lean();

stocks.sort((a, b) => {
  const aSupported = supportedSymbols.has(
    a.symbol
  );

  const bSupported = supportedSymbols.has(
    b.symbol
  );

  if (aSupported && !bSupported) {
    return -1;
  }

  if (!aSupported && bSupported) {
    return 1;
  }

  return a.symbol.localeCompare(
    b.symbol
  );
});

    if (!stocks.length) {
      console.log(
        "⚠️ No stocks available for live update."
      );

      return;
    }

    let requestCount = 0;

    for (const stock of stocks) {
      if (
        requestCount >=
        MAX_REQUESTS_PER_CYCLE
      ) {
        console.log(
          "⏭️ Request limit for this cycle reached."
        );

        break;
      }

      if (
        isSymbolRestricted(
          stock.symbol
        )
      ) {
        continue;
      }

      requestCount++;

      const result =
        await updateStock(stock);

      if (result.rateLimited) {
        console.log(
          "🛑 Stopping current cycle because provider rate limit was reached."
        );

        break;
      }

      // Small delay between requests.
      // This avoids firing requests back-to-back.
      await new Promise(
        (resolve) =>
          setTimeout(resolve, 1500)
      );
    }
  } catch (error) {
    console.error(
      "❌ Market updater error:",
      error.message
    );
  } finally {
    updateRunning = false;
  }
};

/**
 * Start the live updater.
 */
const startLiveMarketUpdater = () => {
  console.log(
    "📡 Meridian live market updater started."
  );

  // First update after a short delay.
  setTimeout(() => {
    updateMarket();
  }, 3000);

  // Continue periodically.
  setInterval(() => {
    updateMarket();
  }, UPDATE_INTERVAL);
};

module.exports = {
  startLiveMarketUpdater,
  updateMarket,
};
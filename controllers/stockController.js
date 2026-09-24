const axios = require("axios");
const Stock = require("../models/Stock");
const PriceHistory = require("../models/PriceHistory");

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";

const historyCache = new Map();

const VALID_INTERVALS = {
  "1day": {
    days: 90,
    outputsize: 90,
  },
  "1week": {
    days: 365,
    outputsize: 52,
  },
  "1month": {
    days: 730,
    outputsize: 24,
  },
};


/* =========================================================
   GET ALL STOCKS
========================================================= */

const getStocks = async (req, res) => {
  try {
    const stocks = await Stock.find({})
      .sort({ symbol: 1 })
      .lean();

    res.json(stocks);
  } catch (error) {
    console.error("Get stocks error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch stocks",
    });
  }
};


/* =========================================================
   GET SINGLE STOCK
========================================================= */

const getStock = async (req, res) => {
  try {
    const symbol = String(req.params.symbol || "")
      .trim()
      .toUpperCase();

    if (!symbol) {
      return res.status(400).json({
        success: false,
        message: "Stock symbol is required",
      });
    }

    const stock = await Stock.findOne({
      symbol,
    }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: "Stock not found",
      });
    }

    res.json(stock);
  } catch (error) {
    console.error("Get stock error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch stock",
    });
  }
};


/* =========================================================
   FORMAT STORED SNAPSHOTS
========================================================= */

const formatStoredHistory = (snapshots, interval) => {
  if (!snapshots.length) {
    return [];
  }

  /*
    We receive snapshots newest → oldest.

    Convert them to chronological order first.
  */

  const chronological = [...snapshots].sort(
    (a, b) =>
      new Date(a.capturedAt) -
      new Date(b.capturedAt)
  );

  /*
    For 1day:
    Keep each captured snapshot.

    For 1week / 1month:
    Keep the latest snapshot from each period.
  */

  if (interval === "1day") {
    return chronological.map((item) => ({
      date: item.capturedAt,
      close: Number(item.price),
      source: item.source || "Meridian snapshot",
    }));
  }

  const buckets = new Map();

  for (const item of chronological) {
    const date = new Date(item.capturedAt);

    let key;

    if (interval === "1week") {
      const year = date.getUTCFullYear();

      const firstDay = new Date(
        Date.UTC(year, 0, 1)
      );

      const diff =
        Math.floor(
          (date - firstDay) /
            (1000 * 60 * 60 * 24)
        );

      const week = Math.floor(diff / 7);

      key = `${year}-W${week}`;
    } else {
      key = `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}`;
    }

    buckets.set(key, item);
  }

  return Array.from(buckets.values()).map(
    (item) => ({
      date: item.capturedAt,
      close: Number(item.price),
      source: item.source || "Meridian snapshot",
    })
  );
};


/* =========================================================
   GET STORED MERIDIAN HISTORY
========================================================= */

const getStoredHistory = async (
  symbol,
  interval
) => {
  const config = VALID_INTERVALS[interval];

  if (!config) {
    return [];
  }

  const startDate = new Date();

  startDate.setDate(
    startDate.getDate() - config.days
  );

  const snapshots = await PriceHistory.find({
    symbol,
    capturedAt: {
      $gte: startDate,
    },
  })
    .sort({
      capturedAt: -1,
    })
    .limit(1000)
    .lean();

  return formatStoredHistory(
    snapshots,
    interval
  );
};


/* =========================================================
   TWELVE DATA HISTORY
========================================================= */

const getTwelveDataHistory = async (
  symbol,
  interval
) => {
  const config = VALID_INTERVALS[interval];

  const response = await axios.get(
    `${TWELVE_DATA_BASE_URL}/time_series`,
    {
      params: {
        symbol,
        interval,
        outputsize: config.outputsize,
        apikey: TWELVE_DATA_API_KEY,
      },
      timeout: 10000,
    }
  );

  const data = response.data;

  if (
    data?.status === "error" ||
    !Array.isArray(data?.values)
  ) {
    throw new Error(
      data?.message ||
        "Historical data unavailable"
    );
  }

  return data.values
    .map((item) => ({
      date: item.datetime,
      close: Number(item.close),
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      volume: Number(item.volume || 0),
      source: "Twelve Data",
    }))
    .filter(
      (item) =>
        Number.isFinite(item.close)
    )
    .reverse();
};


/* =========================================================
   GET STOCK HISTORY
========================================================= */

const getStockHistory = async (req, res) => {
  const symbol = String(
    req.params.symbol || ""
  )
    .trim()
    .toUpperCase();

  const interval =
    String(
      req.query.interval || "1day"
    ).trim();

  try {
    if (!VALID_INTERVALS[interval]) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid interval. Use 1day, 1week or 1month.",
      });
    }

    const stock = await Stock.findOne({
      symbol,
    }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: "Stock not found",
      });
    }

    const cacheKey = `${symbol}_${interval}`;

    const cached = historyCache.get(
      cacheKey
    );

    if (
      cached &&
      Date.now() - cached.timestamp < 5 * 60 * 1000
    ) {
      return res.json(cached.data);
    }


    /* -----------------------------------------------------
       1. Try Twelve Data historical API
    ----------------------------------------------------- */

    try {
      const history =
        await getTwelveDataHistory(
          symbol,
          interval
        );

      const result = {
        success: true,
        symbol,
        interval,
        source: "Twelve Data",
        fallback: false,
        restricted: false,
        history,
      };

      historyCache.set(cacheKey, {
        timestamp: Date.now(),
        data: result,
      });

      return res.json(result);
    } catch (providerError) {
      console.log(
        `Twelve Data history unavailable for ${symbol}:`,
        providerError.message
      );
    }


    /* -----------------------------------------------------
       2. Fallback to Meridian PriceHistory
    ----------------------------------------------------- */

    const storedHistory =
      await getStoredHistory(
        symbol,
        interval
      );

    if (storedHistory.length > 0) {
      const result = {
        success: true,
        symbol,
        interval,
        source: "Meridian snapshots",
        fallback: true,
        restricted: false,
        history: storedHistory,
      };

      historyCache.set(cacheKey, {
        timestamp: Date.now(),
        data: result,
      });

      return res.json(result);
    }


    /* -----------------------------------------------------
       3. No history exists yet
    ----------------------------------------------------- */

    const result = {
      success: true,
      symbol,
      interval,
      source: "No historical data available yet",
      fallback: true,
      restricted: false,
      history: [],
      message:
        "Meridian has not collected enough historical snapshots for this symbol yet.",
    };

    historyCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result,
    });

    return res.json(result);
  } catch (error) {
    console.error(
      `Get stock history error for ${symbol}:`,
      error
    );

    res.status(500).json({
      success: false,
      symbol,
      interval,
      message:
        "Failed to fetch historical data",
      history: [],
    });
  }
};


/* =========================================================
   CLEAR HISTORY CACHE
========================================================= */

const clearHistoryCache = () => {
  historyCache.clear();
};


module.exports = {
  getStocks,
  getStock,
  getStockHistory,
  clearHistoryCache,
};
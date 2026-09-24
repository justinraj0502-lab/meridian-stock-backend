const Stock = require("../models/Stock");

const {
  fetchHistoricalCandles,
} = require("../services/liveMarketService");


/* =========================================================
   HISTORY CACHE
========================================================= */

const historyCache =
  new Map();

const HISTORY_CACHE_TIME =
  60 * 1000;


/* =========================================================
   VALID INTERVALS
========================================================= */

const VALID_INTERVALS = {
  "1day": {
    days: 90,
    angelInterval: "ONE_DAY",
  },

  "1week": {
    days: 365,
    angelInterval: "ONE_DAY",
  },

  "1month": {
    days: 730,
    angelInterval: "ONE_DAY",
  },
};


/* =========================================================
   GET ALL STOCKS
========================================================= */

const getStocks = async (
  req,
  res
) => {
  try {
    const stocks =
      await Stock.find({})
        .sort({
          symbol: 1,
        })
        .lean();

    res.json(stocks);
  } catch (error) {
    console.error(
      "Get stocks error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch stocks",
    });
  }
};


/* =========================================================
   GET SINGLE STOCK
========================================================= */

const getStock = async (
  req,
  res
) => {
  try {
    const symbol =
      String(
        req.params.symbol ||
          ""
      )
        .trim()
        .toUpperCase();

    if (!symbol) {
      return res.status(400).json({
        success: false,
        message:
          "Stock symbol is required",
      });
    }

    const stock =
      await Stock.findOne({
        symbol,
      }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        message:
          "Stock not found",
      });
    }

    res.json(stock);
  } catch (error) {
    console.error(
      "Get stock error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch stock",
    });
  }
};


/* =========================================================
   FORMAT ANGEL ONE CANDLE
========================================================= */

/*
 * Angel One candle format:
 *
 * [
 *   timestamp,
 *   open,
 *   high,
 *   low,
 *   close,
 *   volume
 * ]
 */

const formatCandle =
  (candle) => {
    if (
      !Array.isArray(candle) ||
      candle.length < 6
    ) {
      return null;
    }

    const timestamp =
      candle[0];

    const open =
      Number(candle[1]);

    const high =
      Number(candle[2]);

    const low =
      Number(candle[3]);

    const close =
      Number(candle[4]);

    const volume =
      Number(candle[5]) || 0;

    if (
      !timestamp ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      return null;
    }

    return {
      date: timestamp,

      open,

      high,

      low,

      close,

      volume,

      source:
        "Angel One SmartAPI",
    };
  };


/* =========================================================
   FORMAT DAILY HISTORY
========================================================= */

const formatDailyHistory =
  (candles) => {
    return candles
      .map(formatCandle)
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(a.date) -
          new Date(b.date)
      );
  };


/* =========================================================
   FORMAT WEEKLY HISTORY
========================================================= */

/*
 * Angel One gives us ONE_DAY candles.
 *
 * We aggregate them into weekly candles:
 *
 * Open   = first trading day's open
 * High   = highest high
 * Low    = lowest low
 * Close  = last trading day's close
 * Volume = total volume
 */

const formatWeeklyHistory =
  (candles) => {
    const daily =
      formatDailyHistory(
        candles
      );

    const buckets =
      new Map();

    for (const candle of daily) {
      const date =
        new Date(
          candle.date
        );

      const day =
        date.getUTCDay();

      const difference =
        day === 0
          ? 6
          : day - 1;

      const weekStart =
        new Date(date);

      weekStart.setUTCDate(
        date.getUTCDate() -
          difference
      );

      weekStart.setUTCHours(
        0,
        0,
        0,
        0
      );

      const key =
        weekStart
          .toISOString()
          .slice(0, 10);

      if (
        !buckets.has(key)
      ) {
        buckets.set(
          key,
          {
            date:
              candle.date,

            open:
              candle.open,

            high:
              candle.high,

            low:
              candle.low,

            close:
              candle.close,

            volume:
              candle.volume,

            source:
              "Angel One SmartAPI",
          }
        );

        continue;
      }

      const bucket =
        buckets.get(key);

      bucket.high =
        Math.max(
          bucket.high,
          candle.high
        );

      bucket.low =
        Math.min(
          bucket.low,
          candle.low
        );

      bucket.close =
        candle.close;

      bucket.volume +=
        candle.volume;

      bucket.date =
        candle.date;
    }

    return Array.from(
      buckets.values()
    );
  };


/* =========================================================
   FORMAT MONTHLY HISTORY
========================================================= */

/*
 * Aggregate daily candles into
 * monthly OHLC candles.
 */

const formatMonthlyHistory =
  (candles) => {
    const daily =
      formatDailyHistory(
        candles
      );

    const buckets =
      new Map();

    for (const candle of daily) {
      const date =
        new Date(
          candle.date
        );

      const key =
        `${date.getUTCFullYear()}-${String(
          date.getUTCMonth() + 1
        ).padStart(2, "0")}`;

      if (
        !buckets.has(key)
      ) {
        buckets.set(
          key,
          {
            date:
              candle.date,

            open:
              candle.open,

            high:
              candle.high,

            low:
              candle.low,

            close:
              candle.close,

            volume:
              candle.volume,

            source:
              "Angel One SmartAPI",
          }
        );

        continue;
      }

      const bucket =
        buckets.get(key);

      bucket.high =
        Math.max(
          bucket.high,
          candle.high
        );

      bucket.low =
        Math.min(
          bucket.low,
          candle.low
        );

      bucket.close =
        candle.close;

      bucket.volume +=
        candle.volume;

      bucket.date =
        candle.date;
    }

    return Array.from(
      buckets.values()
    );
  };


/* =========================================================
   FORMAT ANGEL ONE DATE
========================================================= */

const formatAngelDate =
  (date) => {
    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    const hours =
      String(
        date.getHours()
      ).padStart(2, "0");

    const minutes =
      String(
        date.getMinutes()
      ).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };


/* =========================================================
   GET ANGEL ONE HISTORY
========================================================= */

const getAngelOneHistory =
  async ({
    stock,
    interval,
  }) => {
    const config =
      VALID_INTERVALS[
        interval
      ];

    if (!config) {
      return [];
    }

    if (
      !stock.symbolToken
    ) {
      throw new Error(
        `Angel One symbol token is missing for ${stock.symbol}`
      );
    }

    /*
     * Angel One historical API
     * works with date/time strings.
     */

    const toDate =
      new Date();

    const fromDate =
      new Date();

    fromDate.setDate(
      fromDate.getDate() -
        config.days
    );

    const from =
      formatAngelDate(
        fromDate
      );

    const to =
      formatAngelDate(
        toDate
      );

    console.log(
      `📈 Requesting real Angel One history: ${stock.symbol} | ${config.angelInterval} | ${from} → ${to}`
    );

    const candles =
      await fetchHistoricalCandles({
        symbolToken:
          stock.symbolToken,

        interval:
          config.angelInterval,

        fromDate:
          from,

        toDate:
          to,
      });

    if (
      !Array.isArray(
        candles
      )
    ) {
      return [];
    }

    if (
      interval === "1day"
    ) {
      return formatDailyHistory(
        candles
      );
    }

    if (
      interval === "1week"
    ) {
      return formatWeeklyHistory(
        candles
      );
    }

    if (
      interval === "1month"
    ) {
      return formatMonthlyHistory(
        candles
      );
    }

    return [];
  };


/* =========================================================
   GET STOCK HISTORY
========================================================= */

const getStockHistory =
  async (
    req,
    res
  ) => {
    const symbol =
      String(
        req.params.symbol ||
          ""
      )
        .trim()
        .toUpperCase();

    const interval =
      String(
        req.query.interval ||
          "1day"
      ).trim();

    try {
      /* ---------------------------------------------------
         VALIDATE INTERVAL
      --------------------------------------------------- */

      if (
        !VALID_INTERVALS[
          interval
        ]
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid interval. Use 1day, 1week or 1month.",

          history: [],
        });
      }


      /* ---------------------------------------------------
         FIND STOCK
      --------------------------------------------------- */

      const stock =
        await Stock.findOne({
          symbol,
        }).lean();

      if (!stock) {
        return res.status(404).json({
          success: false,

          message:
            "Stock not found",

          history: [],
        });
      }


      /* ---------------------------------------------------
         CACHE
      --------------------------------------------------- */

      const cacheKey =
        `${symbol}_${interval}`;

      const cached =
        historyCache.get(
          cacheKey
        );

      if (
        cached &&
        Date.now() -
          cached.timestamp <
          HISTORY_CACHE_TIME
      ) {
        return res.json(
          cached.data
        );
      }


      /* ---------------------------------------------------
         REAL ANGEL ONE HISTORY
      --------------------------------------------------- */

      const history =
        await getAngelOneHistory({
          stock,

          interval,
        });


      /* ---------------------------------------------------
         HISTORY SUCCESS
      --------------------------------------------------- */

      if (
        history.length > 0
      ) {
        const result = {
          success: true,

          symbol,

          interval,

          source:
            "Angel One SmartAPI",

          fallback: false,

          restricted: false,

          history,
        };

        historyCache.set(
          cacheKey,
          {
            timestamp:
              Date.now(),

            data: result,
          }
        );

        return res.json(
          result
        );
      }


      /* ---------------------------------------------------
         NO DATA
      --------------------------------------------------- */

      const result = {
        success: true,

        symbol,

        interval,

        source:
          "Angel One SmartAPI",

        fallback: true,

        restricted: false,

        history: [],

        message:
          "Angel One did not return historical candles for this symbol and period.",
      };

      historyCache.set(
        cacheKey,
        {
          timestamp:
            Date.now(),

          data: result,
        }
      );

      return res.json(
        result
      );
    } catch (error) {
      console.error(
        `Get stock history error for ${symbol}:`,
        error?.message ||
          error
      );

      if (
        error?.response?.data
      ) {
        console.error(
          "Angel One historical response:",
          error.response.data
        );
      }

      return res.status(500).json({
        success: false,

        symbol,

        interval,

        message:
          error?.message ||
          "Failed to fetch historical data",

        history: [],
      });
    }
  };


/* =========================================================
   CLEAR HISTORY CACHE
========================================================= */

const clearHistoryCache =
  () => {
    historyCache.clear();
  };


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getStocks,

  getStock,

  getStockHistory,

  clearHistoryCache,
};
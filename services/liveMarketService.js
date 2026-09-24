const axios = require("axios");

const Stock = require("../models/Stock");
const PriceHistory = require("../models/PriceHistory");

const {
  getSmartApi,
} = require("./angelOneService");

/* =========================================
   CONFIGURATION
========================================= */

const UPDATE_INTERVAL =
  60 * 1000;

const INSTRUMENT_MASTER_URL =
  "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json";

const MAX_STOCKS_PER_CYCLE = 50;

const ANGEL_ONE_EXCHANGE = "NSE";

const DATA_SOURCE =
  "Angel One SmartAPI";

/*
 * Angel One instrument master is generated daily.
 * Keep it cached for 6 hours.
 */
let instrumentMaster = null;

let instrumentMasterLoadedAt = 0;

const INSTRUMENT_MASTER_REFRESH =
  6 * 60 * 60 * 1000;

let updateRunning = false;

/* =========================================
   SAVE MARKET SNAPSHOT
========================================= */

const savePriceSnapshot = async ({
  symbol,
  price,
  open,
  high,
  low,
  close,
  volume,
}) => {
  try {
    const safePrice =
      Number(price);

    const safeOpen =
      Number(open) || safePrice;

    const safeHigh =
      Number(high) || safePrice;

    const safeLow =
      Number(low) || safePrice;

    const safeClose =
      Number(close) || safePrice;

    const safeVolume =
      Number(volume) || 0;

    await PriceHistory.create({
      symbol,

      open: safeOpen,

      high: safeHigh,

      low: safeLow,

      close: safeClose,

      price: safePrice,

      volume: safeVolume,

      source:
        DATA_SOURCE,

      interval:
        "snapshot",

      capturedAt:
        new Date(),
    });

    /*
     * Keep only latest 1000
     * snapshots for each symbol.
     */
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

    if (
      oldSnapshots.length > 0
    ) {
      await PriceHistory.deleteMany({
        _id: {
          $in:
            oldSnapshots.map(
              (item) =>
                item._id
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

/* =========================================
   LOAD ANGEL ONE INSTRUMENT MASTER
========================================= */

const loadInstrumentMaster =
  async () => {
    const cacheValid =
      instrumentMaster &&
      Date.now() -
        instrumentMasterLoadedAt <
        INSTRUMENT_MASTER_REFRESH;

    if (cacheValid) {
      return instrumentMaster;
    }

    console.log(
      "📚 Loading Angel One instrument master..."
    );

    try {
      const response =
        await axios.get(
          INSTRUMENT_MASTER_URL,
          {
            timeout: 60000,
          }
        );

      if (
        !Array.isArray(
          response.data
        )
      ) {
        throw new Error(
          "Invalid Angel One instrument master response"
        );
      }

      instrumentMaster =
        response.data;

      instrumentMasterLoadedAt =
        Date.now();

      console.log(
        `✅ Angel One instrument master loaded: ${instrumentMaster.length} instruments`
      );

      return instrumentMaster;
    } catch (error) {
      console.error(
        "❌ Failed to load Angel One instrument master:",
        error.message
      );

      throw error;
    }
  };

/* =========================================
   NORMALIZE TEXT
========================================= */

const normalizeText = (
  value
) => {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
};

/* =========================================
   CHECK NSE EQUITY INSTRUMENT
========================================= */

const isNseEquity =
  (instrument) => {
    const exchange =
      normalizeText(
        instrument.exch_seg
      );

    return (
      exchange === "NSE_CM" ||
      exchange === "NSE"
    );
  };

/* =========================================
   FIND NSE EQUITY TOKEN
========================================= */

const findNseEquityInstrument =
  (
    master,
    symbol
  ) => {
    const normalizedSymbol =
      normalizeText(symbol);

    const expectedTradingSymbol =
      `${normalizedSymbol}-EQ`;

    /*
     * METHOD 1
     * Exact NSE trading symbol
     */

    const exact =
      master.find(
        (instrument) => {
          return (
            isNseEquity(
              instrument
            ) &&
            normalizeText(
              instrument.symbol
            ) ===
              expectedTradingSymbol
          );
        }
      );

    if (exact) {
      return exact;
    }

    /*
     * METHOD 2
     * Symbol without relying
     * on exchange case
     */

    const bySymbol =
      master.find(
        (instrument) => {
          const instrumentSymbol =
            normalizeText(
              instrument.symbol
            );

          return (
            isNseEquity(
              instrument
            ) &&
            (
              instrumentSymbol ===
                normalizedSymbol ||
              instrumentSymbol ===
                expectedTradingSymbol
            )
          );
        }
      );

    if (bySymbol) {
      return bySymbol;
    }

    /*
     * METHOD 3
     * Company name + -EQ
     */

    const byName =
      master.find(
        (instrument) => {
          const instrumentName =
            normalizeText(
              instrument.name
            );

          const instrumentSymbol =
            normalizeText(
              instrument.symbol
            );

          return (
            isNseEquity(
              instrument
            ) &&
            instrumentName ===
              normalizedSymbol &&
            instrumentSymbol.endsWith(
              "-EQ"
            )
          );
        }
      );

    if (byName) {
      return byName;
    }

    /*
     * DEBUG POSSIBLE MATCHES
     */

    const possibleMatches =
      master
        .filter(
          (instrument) => {
            if (
              !isNseEquity(
                instrument
              )
            ) {
              return false;
            }

            const instrumentSymbol =
              normalizeText(
                instrument.symbol
              );

            const instrumentName =
              normalizeText(
                instrument.name
              );

            return (
              instrumentSymbol.includes(
                normalizedSymbol
              ) ||
              instrumentName.includes(
                normalizedSymbol
              )
            );
          }
        )
        .slice(0, 3);

    if (
      possibleMatches.length > 0
    ) {
      console.log(
        `🔎 ${normalizedSymbol}: possible Angel One instruments:`,
        possibleMatches.map(
          (item) => ({
            token:
              item.token,

            symbol:
              item.symbol,

            name:
              item.name,

            exch_seg:
              item.exch_seg,
          })
        )
      );
    }

    return null;
  };

/* =========================================
   GET LIVE MARKET DATA
========================================= */

const fetchMarketData =
  async (stocks) => {
    const api =
      await getSmartApi();

    const master =
      await loadInstrumentMaster();

    const exchangeTokens = {
      NSE: [],
    };

    const stockMappings = [];

    for (const stock of stocks) {
      const instrument =
        findNseEquityInstrument(
          master,
          stock.symbol
        );

      if (!instrument) {
        console.log(
          `⚠️ ${stock.symbol}: NSE equity token not found`
        );

        continue;
      }

      console.log(
        `🎯 ${stock.symbol}: ${instrument.symbol} | token ${instrument.token}`
      );

      exchangeTokens.NSE.push(
        String(
          instrument.token
        )
      );

      stockMappings.push({
        stock,
        instrument,
      });
    }

    if (
      exchangeTokens.NSE.length === 0
    ) {
      return [];
    }

    console.log(
      `📡 Requesting Angel One market data for ${exchangeTokens.NSE.length} NSE instruments...`
    );

    /*
     * Angel One SmartAPI FULL quote.
     */
    const response =
      await api.marketData({
        mode: "FULL",
        exchangeTokens,
      });

    if (
      !response ||
      response.status !== true
    ) {
      throw new Error(
        response?.message ||
          "Angel One market data request failed"
      );
    }

    const fetchedData =
      response.data || {};

    const fetchedItems =
      Array.isArray(
        fetchedData.fetched
      )
        ? fetchedData.fetched
        : [];

    console.log(
      `📊 Angel One returned ${fetchedItems.length} market records`
    );

    const results = [];

    for (const mapping of stockMappings) {
      const token =
        String(
          mapping.instrument.token
        );

      const marketItem =
        fetchedItems.find(
          (item) =>
            String(
              item.symbolToken
            ) === token
        );

      if (!marketItem) {
        console.log(
          `⚠️ ${mapping.stock.symbol}: No market data returned for token ${token}`
        );

        continue;
      }

      results.push({
        stock:
          mapping.stock,

        instrument:
          mapping.instrument,

        marketData:
          marketItem,
      });
    }

    return results;
  };

/* =========================================
   FETCH REAL HISTORICAL OHLC CANDLES
========================================= */

/*
 * Angel One SmartAPI historical endpoint:
 *
 * getCandleData({
 *   exchange: "NSE",
 *   symboltoken: "3045",
 *   interval: "ONE_MINUTE",
 *   fromdate: "YYYY-MM-DD HH:mm",
 *   todate: "YYYY-MM-DD HH:mm"
 * })
 *
 * This function is intentionally separate
 * from the live updater.
 *
 * The controller can use it when the frontend
 * requests actual historical chart data.
 */

const fetchHistoricalCandles =
  async ({
    symbolToken,
    interval,
    fromDate,
    toDate,
  }) => {
    try {
      if (
        !symbolToken ||
        !interval ||
        !fromDate ||
        !toDate
      ) {
        throw new Error(
          "Historical candle parameters are incomplete"
        );
      }

      const api =
        await getSmartApi();

      console.log(
        `📈 Fetching Angel One historical candles: token ${symbolToken} | ${interval} | ${fromDate} → ${toDate}`
      );

      const response =
        await api.getCandleData({
          exchange:
            ANGEL_ONE_EXCHANGE,

          symboltoken:
            String(
              symbolToken
            ),

          interval,

          fromdate:
            fromDate,

          todate:
            toDate,
        });

      if (
        !response ||
        response.status !== true
      ) {
        throw new Error(
          response?.message ||
            "Angel One historical candle request failed"
        );
      }

      const candles =
        Array.isArray(
          response.data
        )
          ? response.data
          : [];

      console.log(
        `📈 Angel One returned ${candles.length} historical candles`
      );

      return candles;
    } catch (error) {
      console.error(
        "❌ Angel One historical candle error:",
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

      throw error;
    }
  };

/* =========================================
   UPDATE STOCK DOCUMENT
========================================= */

const updateStockFromMarketData =
  async ({
    stock,
    instrument,
    marketData,
  }) => {
    const symbol =
      stock.symbol;

    const price =
      Number(
        marketData.ltp
      );

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      console.log(
        `⚠️ ${symbol}: Invalid Angel One LTP`
      );

      return {
        success: false,
        error: "Invalid LTP",
      };
    }

    const previousClose =
      Number(
        marketData.close
      ) ||
      Number(
        stock.previousClose
      ) ||
      price;

    const change =
      price -
      previousClose;

    const changePercent =
      previousClose > 0
        ? (change /
            previousClose) *
          100
        : 0;

    const open =
      Number(
        marketData.open
      ) || price;

    const high =
      Number(
        marketData.high
      ) || price;

    const low =
      Number(
        marketData.low
      ) || price;

    const volume =
      Number(
        marketData.tradeVolume
      ) ||
      Number(
        marketData.volume
      ) ||
      0;

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

          dataSource:
            DATA_SOURCE,

          isLive: true,

          lastUpdated:
            new Date(),

          exchange:
            ANGEL_ONE_EXCHANGE,

          symbolToken:
            String(
              instrument.token
            ),

          tradingSymbol:
            instrument.symbol,
        },
      }
    );

    /*
     * Save the complete live snapshot.
     *
     * This now stores OHLCV instead of
     * only the LTP.
     */
    await savePriceSnapshot({
      symbol,

      price,

      open,

      high,

      low,

      close:
        previousClose,

      volume,
    });

    console.log(
      `✅ ${symbol}: ₹${price} live Angel One snapshot saved`
    );

    return {
      success: true,

      symbol,

      price,

      open,

      high,

      low,

      volume,
    };
  };

/* =========================================
   UPDATE MARKET
========================================= */

const updateMarket =
  async () => {
    if (updateRunning) {
      console.log(
        "⏳ Previous market update is still running. Skipping cycle."
      );

      return;
    }

    updateRunning = true;

    try {
      const stocks =
        await Stock.find({})
          .lean();

      if (!stocks.length) {
        console.log(
          "⚠️ No stocks available for live update."
        );

        return;
      }

      const stocksToUpdate =
        stocks.slice(
          0,
          MAX_STOCKS_PER_CYCLE
        );

      console.log(
        `📡 Fetching Angel One market data for ${stocksToUpdate.length} stocks...`
      );

      const results =
        await fetchMarketData(
          stocksToUpdate
        );

      if (!results.length) {
        console.log(
          "⚠️ Angel One returned no market data."
        );

        return;
      }

      for (const result of results) {
        await updateStockFromMarketData(
          result
        );
      }

      console.log(
        `📊 Angel One market update completed: ${results.length}/${stocksToUpdate.length} stocks`
      );
    } catch (error) {
      console.error(
        "❌ Angel One market updater error:",
        error.message
      );

      if (
        error?.response?.data
      ) {
        console.error(
          "Angel One response:",
          error.response.data
        );
      }
    } finally {
      updateRunning = false;
    }
  };

/* =========================================
   START LIVE MARKET UPDATER
========================================= */

const startLiveMarketUpdater =
  () => {
    console.log(
      "📡 Meridian Angel One live market updater started."
    );

    /*
     * First update after startup.
     */
    setTimeout(() => {
      updateMarket();
    }, 5000);

    /*
     * Continue every 60 seconds.
     */
    setInterval(() => {
      updateMarket();
    }, UPDATE_INTERVAL);
  };

/* =========================================
   EXPORTS
========================================= */

module.exports = {
  startLiveMarketUpdater,

  updateMarket,

  fetchHistoricalCandles,
};
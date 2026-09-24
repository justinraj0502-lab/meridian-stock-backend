const {
  updateMarket,
} = require("./liveMarketService");

/*
=========================================================
MERIDIAN MARKET DATA SERVICE
=========================================================

Twelve Data has been completely removed.

Angel One SmartAPI is now the source for live NSE
market data.

The actual implementation lives in:

server/services/liveMarketService.js

This wrapper keeps refreshMarketData() available for
any older backend code that still imports it.
=========================================================
*/

const refreshMarketData = async () => {
  try {
    console.log(
      "📡 Market data refresh requested..."
    );

    await updateMarket();

    return {
      success: true,
      message:
        "Angel One market data refreshed successfully",
    };
  } catch (error) {
    console.error(
      "❌ Angel One market data refresh failed:",
      error?.message || error
    );

    return {
      success: false,
      message:
        error?.message ||
        "Unable to refresh market data",
    };
  }
};


module.exports = {
  refreshMarketData,
};
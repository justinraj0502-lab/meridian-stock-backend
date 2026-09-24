const Stock = require("../models/Stock");

const stocks = [
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    price: 1425.5,
    previousClose: 1418.2,
    marketCap: 1920000000000,
    sector: "Energy",
  },

  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    price: 3842.75,
    previousClose: 3815.4,
    marketCap: 1390000000000,
    sector: "Technology",
  },

  {
    symbol: "INFY",
    name: "Infosys",
    price: 1528.6,
    previousClose: 1512.3,
    marketCap: 635000000000,
    sector: "Technology",
  },

  {
    symbol: "HDFCBANK",
    name: "HDFC Bank",
    price: 1742.3,
    previousClose: 1735.8,
    marketCap: 1320000000000,
    sector: "Financial Services",
  },

  {
    symbol: "ICICIBANK",
    name: "ICICI Bank",
    price: 1324.9,
    previousClose: 1318.5,
    marketCap: 930000000000,
    sector: "Financial Services",
  },

  {
    symbol: "SBIN",
    name: "State Bank of India",
    price: 842.4,
    previousClose: 835.2,
    marketCap: 750000000000,
    sector: "Financial Services",
  },

  {
    symbol: "ITC",
    name: "ITC Limited",
    price: 462.8,
    previousClose: 459.6,
    marketCap: 575000000000,
    sector: "Consumer",
  },

  {
    symbol: "BHARTIARTL",
    name: "Bharti Airtel",
    price: 1968.5,
    previousClose: 1942.7,
    marketCap: 1170000000000,
    sector: "Telecommunications",
  },

  {
    symbol: "WIPRO",
    name: "Wipro",
    price: 548.35,
    previousClose: 542.9,
    marketCap: 286000000000,
    sector: "Technology",
  },

  {
    symbol: "LT",
    name: "Larsen & Toubro",
    price: 3658.2,
    previousClose: 3622.4,
    marketCap: 502000000000,
    sector: "Industrials",
  },
];

const seedStocks = async () => {
  try {
    for (const stock of stocks) {
      const existing = await Stock.findOne({
        symbol: stock.symbol,
      });

      if (existing) {
        continue;
      }

      const change =
        stock.price - stock.previousClose;

      const changePercent =
        stock.previousClose > 0
          ? (change / stock.previousClose) * 100
          : 0;

      await Stock.create({
        ...stock,

        change,
        changePercent,

        open: stock.price,
        high: stock.price,
        low: stock.price,

        volume: 0,

        exchange: "NSE",
        currency: "INR",

        dataSource: "Seed",
        isLive: false,
        isMarketOpen: false,

        lastUpdated: new Date(),
      });

      console.log(`➕ Added ${stock.symbol}`);
    }

    console.log("✅ Stock database initialized");
  } catch (error) {
    console.error("❌ Stock seed error:", error.message);
  }
};

module.exports = seedStocks;
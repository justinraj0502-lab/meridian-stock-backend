const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  getPortfolio,
  buyStock,
  sellStock,
  getTransactions,
  getPortfolioHistory,
} = require("../controllers/portfolioController");

const router = express.Router();

/* =========================================
   CURRENT PORTFOLIO
   ========================================= */

router.get(
  "/",
  protect,
  getPortfolio
);

/* =========================================
   PORTFOLIO PERFORMANCE HISTORY
   ========================================= */

router.get(
  "/history",
  protect,
  getPortfolioHistory
);

/* =========================================
   BUY / SELL
   ========================================= */

router.post(
  "/buy",
  protect,
  buyStock
);

router.post(
  "/sell",
  protect,
  sellStock
);

/* =========================================
   TRANSACTIONS
   ========================================= */

router.get(
  "/transactions",
  protect,
  getTransactions
);

module.exports = router;
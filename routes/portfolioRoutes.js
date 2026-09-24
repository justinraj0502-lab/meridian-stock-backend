const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  getPortfolio,
  buyStock,
  sellStock,
  getTransactions,
} = require("../controllers/portfolioController");

const router = express.Router();

router.get("/", protect, getPortfolio);

router.post("/buy", protect, buyStock);

router.post("/sell", protect, sellStock);

router.get(
  "/transactions",
  protect,
  getTransactions
);

module.exports = router;
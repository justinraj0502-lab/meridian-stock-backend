const express = require("express");

const {
  getStocks,
  getStock,
  getStockHistory,
} = require("../controllers/stockController");

const router = express.Router();

router.get("/", getStocks);

router.get("/:symbol/history", getStockHistory);

router.get("/:symbol", getStock);

module.exports = router;
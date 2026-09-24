const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  createAlert,
  getAlerts,
  deleteAlert,
  refreshAlerts,
} = require("../controllers/alertController");

const router = express.Router();

/* =========================================
   GET USER ALERTS
========================================= */

router.get(
  "/",
  protect,
  getAlerts
);

/* =========================================
   CREATE ALERT
========================================= */

router.post(
  "/",
  protect,
  createAlert
);

/* =========================================
   REFRESH ALERT PRICES
========================================= */

router.post(
  "/refresh",
  protect,
  refreshAlerts
);

/* =========================================
   DELETE ALERT
========================================= */

router.delete(
  "/:id",
  protect,
  deleteAlert
);

module.exports = router;
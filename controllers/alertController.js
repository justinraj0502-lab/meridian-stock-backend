const Alert = require("../models/Alert");
const Stock = require("../models/Stock");

/* =========================================
   HELPERS
   ========================================= */

const normalizeSymbol = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase();
};

const normalizeAlertType = (value) => {
  const type = String(value || "")
    .trim()
    .toLowerCase();

  if (type === "above") {
    return "Above";
  }

  if (type === "below") {
    return "Below";
  }

  return null;
};

const parseTarget = (value) => {
  const target = Number(value);

  if (
    !Number.isFinite(target) ||
    target <= 0
  ) {
    return null;
  }

  return target;
};

const checkTriggered = (
  type,
  currentPrice,
  target
) => {
  const current = Number(currentPrice);
  const targetPrice = Number(target);

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(targetPrice)
  ) {
    return false;
  }

  if (type === "Above") {
    return current >= targetPrice;
  }

  if (type === "Below") {
    return current <= targetPrice;
  }

  return false;
};

const roundMoney = (value) => {
  return (
    Math.round(
      (Number(value) + Number.EPSILON) * 100
    ) / 100
  );
};

/* =========================================
   CREATE ALERT
   ========================================= */

const createAlert = async (req, res) => {
  try {
    const symbol = normalizeSymbol(
      req.body.symbol
    );

    const type = normalizeAlertType(
      req.body.type
    );

    const target = parseTarget(
      req.body.target
    );

    /* =====================================
       VALIDATION
       ===================================== */

    if (!symbol) {
      return res.status(400).json({
        success: false,
        message:
          "Stock symbol is required.",
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        message:
          "Alert type must be Above or Below.",
      });
    }

    if (target === null) {
      return res.status(400).json({
        success: false,
        message:
          "Target price must be greater than zero.",
      });
    }

    /* =====================================
       STOCK
       ===================================== */

    const stock =
      await Stock.findOne({
        symbol,
      }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        message:
          "Stock not found.",
      });
    }

    const currentPrice =
      Number(stock.price);

    if (
      !Number.isFinite(
        currentPrice
      ) ||
      currentPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid live market price is currently unavailable.",
      });
    }

    /* =====================================
       INITIAL TRIGGER STATE
       ===================================== */

    const triggered =
      checkTriggered(
        type,
        currentPrice,
        target
      );

    const now =
      new Date();

    /* =====================================
       CREATE
       ===================================== */

    const alert =
      await Alert.create({
        user: req.user._id,

        symbol:
          stock.symbol,

        name:
          stock.name,

        type,

        target:
          roundMoney(target),

        current:
          roundMoney(
            currentPrice
          ),

        dataSource:
          stock.dataSource ||
          "Angel One SmartAPI",

        isLive:
          Boolean(
            stock.isLive
          ),

        isMarketOpen:
          Boolean(
            stock.isMarketOpen
          ),

        lastUpdated:
          stock.lastUpdated ||
          now,

        triggered,

        triggeredAt:
          triggered
            ? now
            : null,

        active:
          !triggered,

        notificationSent:
          false,

        notificationSentAt:
          null,
      });

    return res.status(201).json({
      success: true,

      message:
        triggered
          ? "Alert created and triggered immediately."
          : "Price alert created successfully.",

      alert,
    });
  } catch (error) {
    console.error(
      "Create alert error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create price alert.",
    });
  }
};

/* =========================================
   GET USER ALERTS
   ========================================= */

const getAlerts = async (req, res) => {
  try {
    const alerts =
      await Alert.find({
        user: req.user._id,
      })
        .sort({
          createdAt: -1,
        })
        .lean();

    return res.json({
      success: true,

      count:
        alerts.length,

      alerts,
    });
  } catch (error) {
    console.error(
      "Get alerts error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load price alerts.",
    });
  }
};

/* =========================================
   DELETE ALERT
   ========================================= */

const deleteAlert = async (req, res) => {
  try {
    const alertId =
      String(
        req.params.id || ""
      ).trim();

    if (!alertId) {
      return res.status(400).json({
        success: false,
        message:
          "Alert ID is required.",
      });
    }

    const alert =
      await Alert.findOneAndDelete({
        _id: alertId,
        user: req.user._id,
      });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message:
          "Alert not found.",
      });
    }

    return res.json({
      success: true,

      message:
        "Alert deleted successfully.",

      alertId,
    });
  } catch (error) {
    console.error(
      "Delete alert error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to delete price alert.",
    });
  }
};

/* =========================================
   REFRESH USER ALERTS
   ========================================= */

const refreshAlerts = async (req, res) => {
  try {
    const alerts =
      await Alert.find({
        user: req.user._id,
      });

    if (!alerts.length) {
      return res.json({
        success: true,

        count: 0,

        triggeredCount: 0,

        alerts: [],
      });
    }

    const symbols = [
      ...new Set(
        alerts.map(
          (alert) =>
            normalizeSymbol(
              alert.symbol
            )
        )
      ),
    ];

    const stocks =
      await Stock.find({
        symbol: {
          $in: symbols,
        },
      }).lean();

    const stockMap =
      new Map(
        stocks.map(
          (stock) => [
            normalizeSymbol(
              stock.symbol
            ),
            stock,
          ]
        )
      );

    let triggeredCount = 0;

    const updatedAlerts = [];

    for (const alert of alerts) {
      const stock =
        stockMap.get(
          normalizeSymbol(
            alert.symbol
          )
        );

      if (!stock) {
        updatedAlerts.push(
          alert.toObject()
        );

        continue;
      }

      const currentPrice =
        Number(stock.price);

      if (
        !Number.isFinite(
          currentPrice
        ) ||
        currentPrice <= 0
      ) {
        updatedAlerts.push(
          alert.toObject()
        );

        continue;
      }

      const wasTriggered =
        Boolean(
          alert.triggered
        );

      const isTriggered =
        checkTriggered(
          alert.type,
          currentPrice,
          alert.target
        );

      /*
       * Only set triggeredAt when
       * the alert transitions from
       * watching -> triggered.
       */

      if (
        !wasTriggered &&
        isTriggered
      ) {
        alert.triggeredAt =
          new Date();

        alert.notificationSent =
          false;

        alert.notificationSentAt =
          null;
      }

      /*
       * Once triggered, keep it
       * triggered.
       *
       * This prevents an alert from
       * repeatedly switching between
       * Watching and Triggered when
       * price moves around the target.
       */

      if (
        wasTriggered
      ) {
        alert.triggered =
          true;

        alert.active =
          false;
      } else {
        alert.triggered =
          isTriggered;

        alert.active =
          !isTriggered;
      }

      alert.current =
        roundMoney(
          currentPrice
        );

      alert.dataSource =
        stock.dataSource ||
        "Angel One SmartAPI";

      alert.isLive =
        Boolean(
          stock.isLive
        );

      alert.isMarketOpen =
        Boolean(
          stock.isMarketOpen
        );

      alert.lastUpdated =
        stock.lastUpdated ||
        new Date();

      await alert.save();

      if (alert.triggered) {
        triggeredCount++;
      }

      updatedAlerts.push(
        alert.toObject()
      );
    }

    return res.json({
      success: true,

      count:
        updatedAlerts.length,

      triggeredCount,

      alerts:
        updatedAlerts,
    });
  } catch (error) {
    console.error(
      "Refresh alerts error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to refresh price alerts.",
    });
  }
};

/* =========================================
   EXPORTS
   ========================================= */

module.exports = {
  createAlert,
  getAlerts,
  deleteAlert,
  refreshAlerts,
};
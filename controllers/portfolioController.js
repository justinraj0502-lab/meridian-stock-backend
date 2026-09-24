const User = require("../models/User");
const Stock = require("../models/Stock");
const Portfolio = require("../models/Portfolio");
const Transaction = require("../models/Transaction");

/* =========================================
   HELPERS
   ========================================= */

const normalizeSymbol = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase();
};

const parseQuantity = (value) => {
  const quantity = Number(value);

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  return quantity;
};

const roundMoney = (value) => {
  return Math.round(
    (Number(value) + Number.EPSILON) * 100
  ) / 100;
};

/* =========================================
   GET PORTFOLIO
   ========================================= */

const getPortfolio = async (req, res) => {
  try {
    let portfolio =
      await Portfolio.findOne({
        user: req.user._id,
      });

    if (!portfolio) {
      portfolio =
        await Portfolio.create({
          user: req.user._id,
          holdings: [],
        });
    }

    const stocks =
      await Stock.find()
        .select(
          "symbol name price previousClose change changePercent lastUpdated dataSource isLive isMarketOpen"
        )
        .lean();

    const stockMap = new Map(
      stocks.map((stock) => [
        stock.symbol,
        stock,
      ])
    );

    let totalValue = 0;
    let totalInvested = 0;

    const holdings =
      portfolio.holdings.map(
        (holding) => {
          const stock =
            stockMap.get(
              holding.symbol
            );

          /*
           * Use the latest stored market price.
           *
           * If the stock is temporarily missing
           * from the market database, use the
           * holding's average price only as a
           * calculation safeguard.
           *
           * This is NOT presented as a live quote.
           */
          const currentPrice =
            stock &&
            Number.isFinite(
              Number(stock.price)
            )
              ? Number(stock.price)
              : Number(
                  holding.averagePrice
                );

          const quantity =
            Number(
              holding.quantity
            ) || 0;

          const averagePrice =
            Number(
              holding.averagePrice
            ) || 0;

          const currentValue =
            roundMoney(
              quantity *
                currentPrice
            );

          const investedValue =
            roundMoney(
              quantity *
                averagePrice
            );

          const profitLoss =
            roundMoney(
              currentValue -
                investedValue
            );

          const profitLossPercent =
            investedValue > 0
              ? roundMoney(
                  (profitLoss /
                    investedValue) *
                    100
                )
              : 0;

          totalValue +=
            currentValue;

          totalInvested +=
            investedValue;

          return {
            ...holding.toObject(),

            quantity,

            averagePrice,

            currentPrice,

            currentValue,

            investedValue,

            profitLoss,

            profitLossPercent,

            quote: stock
              ? {
                  isLive:
                    Boolean(
                      stock.isLive
                    ),

                  isMarketOpen:
                    Boolean(
                      stock.isMarketOpen
                    ),

                  lastUpdated:
                    stock.lastUpdated,

                  dataSource:
                    stock.dataSource ||
                    "Unknown",
                }
              : null,
          };
        }
      );

    totalValue =
      roundMoney(totalValue);

    totalInvested =
      roundMoney(totalInvested);

    const totalProfitLoss =
      roundMoney(
        totalValue -
          totalInvested
      );

    const totalProfitLossPercent =
      totalInvested > 0
        ? roundMoney(
            (totalProfitLoss /
              totalInvested) *
              100
          )
        : 0;

    portfolio.totalValue =
      totalValue;

    portfolio.totalInvested =
      totalInvested;

    portfolio.totalProfitLoss =
      totalProfitLoss;

    await portfolio.save();

    return res.json({
      success: true,

      portfolio: {
        ...portfolio.toObject(),

        holdings,

        totalValue,

        totalInvested,

        totalProfitLoss,

        totalProfitLossPercent,
      },

      balance:
        roundMoney(
          req.user.balance
        ),
    });
  } catch (error) {
    console.error(
      "Portfolio error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load portfolio.",
    });
  }
};

/* =========================================
   BUY STOCK
   ========================================= */

const buyStock = async (req, res) => {
  try {
    const symbol =
      normalizeSymbol(
        req.body.symbol
      );

    const buyQuantity =
      parseQuantity(
        req.body.quantity
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

    if (buyQuantity === null) {
      return res.status(400).json({
        success: false,
        message:
          "Quantity must be greater than zero.",
      });
    }

    /* =====================================
       STOCK
       ===================================== */

    const stock =
      await Stock.findOne({
        symbol,
      });

    if (!stock) {
      return res.status(404).json({
        success: false,
        message:
          "Stock not found.",
      });
    }

    const marketPrice =
      Number(stock.price);

    if (
      !Number.isFinite(
        marketPrice
      ) ||
      marketPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid market price is currently unavailable for this stock.",
      });
    }

    /*
     * IMPORTANT:
     *
     * This is the exact price stored in
     * MongoDB when the order is processed.
     */
    const executionPrice =
      marketPrice;

    const totalCost =
      roundMoney(
        executionPrice *
          buyQuantity
      );

    /* =====================================
       USER
       ===================================== */

    const user =
      await User.findById(
        req.user._id
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User account not found.",
      });
    }

    const currentBalance =
      Number(user.balance) || 0;

    if (
      currentBalance <
      totalCost
    ) {
      return res.status(400).json({
        success: false,
        message:
          `Insufficient virtual balance. You need ₹${totalCost.toLocaleString(
            "en-IN",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}.`,
      });
    }

    /* =====================================
       PORTFOLIO
       ===================================== */

    let portfolio =
      await Portfolio.findOne({
        user: user._id,
      });

    if (!portfolio) {
      portfolio =
        await Portfolio.create({
          user: user._id,
          holdings: [],
        });
    }

    const existingHolding =
      portfolio.holdings.find(
        (holding) =>
          holding.symbol ===
          stock.symbol
      );

    if (existingHolding) {
      const oldQuantity =
        Number(
          existingHolding.quantity
        ) || 0;

      const oldAveragePrice =
        Number(
          existingHolding.averagePrice
        ) || 0;

      const oldInvestment =
        oldQuantity *
        oldAveragePrice;

      const newInvestment =
        totalCost;

      const newQuantity =
        oldQuantity +
        buyQuantity;

      const newAveragePrice =
        (
          oldInvestment +
          newInvestment
        ) / newQuantity;

      existingHolding.quantity =
        newQuantity;

      existingHolding.averagePrice =
        roundMoney(
          newAveragePrice
        );

      existingHolding.investedValue =
        roundMoney(
          newQuantity *
            newAveragePrice
        );
    } else {
      portfolio.holdings.push({
        symbol:
          stock.symbol,

        name:
          stock.name,

        quantity:
          buyQuantity,

        averagePrice:
          executionPrice,

        investedValue:
          totalCost,
      });
    }

    /* =====================================
       UPDATE BALANCE
       ===================================== */

    user.balance =
      roundMoney(
        currentBalance -
          totalCost
      );

    /* =====================================
       SAVE PORTFOLIO
       ===================================== */

    await user.save();
    await portfolio.save();

    /* =====================================
       TRANSACTION RECORD
       ===================================== */

    const transaction =
      await Transaction.create({
        user: user._id,

        symbol:
          stock.symbol,

        type: "BUY",

        quantity:
          buyQuantity,

        price:
          executionPrice,

        total:
          totalCost,
      });

    /* =====================================
       RESPONSE
       ===================================== */

    return res.status(201).json({
      success: true,

      message:
        `Bought ${buyQuantity} ${stock.symbol}.`,

      transaction: {
        _id:
          transaction._id,

        type: "BUY",

        symbol:
          stock.symbol,

        quantity:
          buyQuantity,

        price:
          executionPrice,

        total:
          totalCost,

        executedAt:
          transaction.createdAt,
      },

      balance:
        user.balance,

      quote: {
        isLive:
          Boolean(
            stock.isLive
          ),

        isMarketOpen:
          Boolean(
            stock.isMarketOpen
          ),

        lastUpdated:
          stock.lastUpdated,

        dataSource:
          stock.dataSource ||
          "Unknown",
      },
    });
  } catch (error) {
    console.error(
      "Buy error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to complete buy order.",
    });
  }
};

/* =========================================
   SELL STOCK
   ========================================= */

const sellStock = async (req, res) => {
  try {
    const symbol =
      normalizeSymbol(
        req.body.symbol
      );

    const sellQuantity =
      parseQuantity(
        req.body.quantity
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

    if (sellQuantity === null) {
      return res.status(400).json({
        success: false,
        message:
          "Quantity must be greater than zero.",
      });
    }

    /* =====================================
       STOCK
       ===================================== */

    const stock =
      await Stock.findOne({
        symbol,
      });

    if (!stock) {
      return res.status(404).json({
        success: false,
        message:
          "Stock not found.",
      });
    }

    const marketPrice =
      Number(stock.price);

    if (
      !Number.isFinite(
        marketPrice
      ) ||
      marketPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid market price is currently unavailable for this stock.",
      });
    }

    const executionPrice =
      marketPrice;

    const user =
      await User.findById(
        req.user._id
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User account not found.",
      });
    }

    /* =====================================
       PORTFOLIO
       ===================================== */

    const portfolio =
      await Portfolio.findOne({
        user: user._id,
      });

    if (!portfolio) {
      return res.status(400).json({
        success: false,
        message:
          "Portfolio not found.",
      });
    }

    const holding =
      portfolio.holdings.find(
        (item) =>
          item.symbol ===
          stock.symbol
      );

    if (!holding) {
      return res.status(400).json({
        success: false,
        message:
          `You do not own ${stock.symbol}.`,
      });
    }

    const ownedQuantity =
      Number(
        holding.quantity
      ) || 0;

    if (
      ownedQuantity <
      sellQuantity
    ) {
      return res.status(400).json({
        success: false,
        message:
          `Insufficient shares. You own ${ownedQuantity} ${stock.symbol}.`,
      });
    }

    /* =====================================
       SELL VALUE
       ===================================== */

    const totalRevenue =
      roundMoney(
        executionPrice *
          sellQuantity
      );

    /* =====================================
       UPDATE HOLDING
       ===================================== */

    const remainingQuantity =
      ownedQuantity -
      sellQuantity;

    if (
      remainingQuantity <= 0
    ) {
      portfolio.holdings =
        portfolio.holdings.filter(
          (item) =>
            item.symbol !==
            stock.symbol
        );
    } else {
      holding.quantity =
        remainingQuantity;

      holding.investedValue =
        roundMoney(
          remainingQuantity *
            Number(
              holding.averagePrice
            )
        );
    }

    /* =====================================
       UPDATE BALANCE
       ===================================== */

    const currentBalance =
      Number(user.balance) || 0;

    user.balance =
      roundMoney(
        currentBalance +
          totalRevenue
      );

    /* =====================================
       SAVE
       ===================================== */

    await user.save();
    await portfolio.save();

    /* =====================================
       TRANSACTION
       ===================================== */

    const transaction =
      await Transaction.create({
        user: user._id,

        symbol:
          stock.symbol,

        type: "SELL",

        quantity:
          sellQuantity,

        price:
          executionPrice,

        total:
          totalRevenue,
      });

    /* =====================================
       RESPONSE
       ===================================== */

    return res.status(201).json({
      success: true,

      message:
        `Sold ${sellQuantity} ${stock.symbol}.`,

      transaction: {
        _id:
          transaction._id,

        type: "SELL",

        symbol:
          stock.symbol,

        quantity:
          sellQuantity,

        price:
          executionPrice,

        total:
          totalRevenue,

        executedAt:
          transaction.createdAt,
      },

      balance:
        user.balance,

      quote: {
        isLive:
          Boolean(
            stock.isLive
          ),

        isMarketOpen:
          Boolean(
            stock.isMarketOpen
          ),

        lastUpdated:
          stock.lastUpdated,

        dataSource:
          stock.dataSource ||
          "Unknown",
      },
    });
  } catch (error) {
    console.error(
      "Sell error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to complete sell order.",
    });
  }
};

/* =========================================
   GET TRANSACTIONS
   ========================================= */

const getTransactions =
  async (req, res) => {
    try {
      const transactions =
        await Transaction.find({
          user: req.user._id,
        })
          .sort({
            createdAt: -1,
          })
          .lean();

      return res.json({
        success: true,
        count:
          transactions.length,
        transactions,
      });
    } catch (error) {
      console.error(
        "Transaction error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load transactions.",
      });
    }
  };

/* =========================================
   EXPORTS
   ========================================= */

module.exports = {
  getPortfolio,
  buyStock,
  sellStock,
  getTransactions,
};
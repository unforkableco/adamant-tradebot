const LBANKApi = require('./api/lbank_api');
const utils = require('../helpers/utils');

// API endpoints:
const apiServer = 'https://api.lbkex.com/v2';
const exchangeName = 'LBANK';

module.exports = (
    apiKey,
    secretKey,
    pwd,
    log,
    publicOnly = false,
    loadMarket = true,
) => {
  const lbankApiClient = LBANKApi();

  lbankApiClient.setConfig(apiServer, apiKey, secretKey, log, publicOnly);

  // Fulfill markets on initialization
  if (loadMarket) {
    getMarkets();
  }

  /**
   * Get info on all markets or return info on a specific market
   * @param {String} pair In classic format like BTC/USDT. If not provided, update all markets.
   * @returns {Promise<unknown>|*}
   */
  function getMarkets(pair) {
    const paramString = `pair: ${pair}`;
    if (module.exports.gettingMarkets) return;
    if (module.exports.exchangeMarkets) return module.exports.exchangeMarkets[pair];

    module.exports.gettingMarkets = true;
    return new Promise((resolve) => {
      lbankApiClient.markets().then((scData) => {
        try {
          const markets = scData.data;

          const result = {};

          markets.forEach(market => {

            const pair = deformatPairName(market.symbol);

            result[pair.pairReadable] = {
              pairReadable: pair.pairReadable,
              pairPlain: pair.pair,
              coin1: pair.coin1, // base
              coin2: pair.coin2, // quote
              coin1Decimals: +market.quantityAccuracy,
              coin2Decimals: +market.priceAccuracy,
              coin1Precision: utils.getPrecision(+market.quantityAccuracy),
              coin2Precision: utils.getPrecision(+market.priceAccuracy),
              // minTrade: market.minTranQua
            };
          });

          if (Object.keys(result).length > 0) {
            module.exports.exchangeMarkets = result;
            log.log(`Received info about ${Object.keys(result).length} markets on ${exchangeName} exchange.`);
          }

          resolve(result);
        } catch (e) {
          log.warn(`Error while processing getMarkets(${paramString}) request: ${e}`);
          return undefined;
        }
      }).catch((err) => {
        log.warn(`API request getMarkets(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        resolve(undefined);
      }).finally(() => {
        module.exports.gettingMarkets = false;
      });
    });
  }

  return {
    getMarkets,

    get markets() {
      return module.exports.exchangeMarkets;
    },

    /**
     * Get market info for a pair
     * @param pair In classic format like BTC/USDT
     * @returns {Promise<*>|*}
     */
    marketInfo(pair) {
      return getMarkets(pair);
    },

    features() {
      return {
        getMarkets: true,
        getCurrencies: false,
        placeMarketOrder: false,
        getDepositAddress: true,
        getTradingFees: false,
        getAccountTradeVolume: false,
        createDepositAddressWithWebsiteOnly: true,
        getFundHistory: false,
        getFundHistoryImplemented: false,
        supportCoinNetworks: false,
        allowAmountForMarketBuy: false,
        amountForMarketOrderNecessary: true,
      };
    },

    /**
     * List of account balances for all currencies
     * @param {Boolean} nonzero
     * @returns {Promise<[]|undefined>}
     */
    async getBalances(nonzero = true) {
      const paramString = `nonzero: ${nonzero}`;

      let scData;

      try {
        scData = await lbankApiClient.getUserData();
      } catch (err) {
        log.warn(`API request getBalances(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }

      const userData = scData.data;
      try {
        let result = [];

        for (const crypto of userData.balances) {
          result.push({
            code: crypto.asset,
            free: +crypto.free,
            freezed: +crypto.locked,
            total: +crypto.free + +crypto.locked,
          });
        }

        if (nonzero) {
          result = result.filter((crypto) => crypto.free || crypto.freezed);
        }

        return result;
      } catch (e) {
        log.warn(`Error while processing getBalances(${paramString}) request: ${e}`);
        return undefined;
      }
    },

    /**
     * List of all account open orders
     * @param {String} pair In classic format as BTC/USD
     * @returns {Promise<[]|undefined>}
     */
    async getOpenOrders(pair) {
      const paramString = `pair: ${pair}`;
      const pair_ = formatPairName(pair);

      let scData;

      try {
        scData = await lbankApiClient.getOrders(pair_.pair.toLowerCase());
      } catch (err) {
        log.warn(`API request getOpenOrders(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }

      if(!scData.result || scData.error_code != 0) {
        log.warn(`API request getOpenOrders(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${scData.error_code}`);
        return undefined;
      }
      const orders = scData.data.orders;

      try {
        const result = [];
        // if no open orders this is undefined
        if(!orders) return result;

        orders.forEach((order) => {
          let orderStatus;
          const pair = deformatPairName(order.symbol);

          const amountLeft = +order.amount - +order.deal_amount;

          // if([-1,2,3,4].includes(order.status)) {
          //   return; // skip cancelled and filled orders
          // }

          if(order.status == 1) {
            orderStatus = 'part_filled';
          } else {
            orderStatus = 'new';
          }
          // buy, sell, buy_market, sell_market, buy_maker, sell_maker, buy_ioc, sell_ioc, buy_fok, sell_fok
          const side = order.type.startsWith("buy") ? "buy" : "sell";
          const type = order.type.endsWith("market") ? "market" : "limit";

          result.push({
            orderId: order.order_id,
            symbol: pair.pairReadable,
            price: +order.price,
            side,
            type,
            timestamp: order.create_time,
            amount: +order.amount,
            amountExecuted: +order.deal_amount,
            amountLeft,
            status: orderStatus
          });
        });

        return result;
      } catch (e) {
        log.warn(`Error while processing getOpenOrders(${paramString}) request: ${e}`);
        return undefined;
      }
    },

    /**
     * Cancel an order
     * @param {String} orderId Example: c4f33636-7092-4f7c-bf89-b7b665774745
     * @param {String} side 'buy' or 'sell'. Not used for LBANK.
     * @param {String} pair In classic format as BTC/USDT.
     * @returns {Promise<Boolean|undefined>}
     */
    async cancelOrder(orderId, side, pair) {
      const paramString = `orderId: ${orderId}, pair: ${pair}`;
      const pair_ = formatPairName(pair);

      let scData;

      try {
        scData = await lbankApiClient.cancelOrder(orderId, pair_.pairPlain.toLowerCase());
      } catch (err) {
        log.warn(`API request cancelOrder(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }

      if(!scData.result || scData.error_code != 0) {
        log.log(`Failed to cancel order ${orderId} on ${pair_.pairReadable} pair: ${scData?.error_code}. Assuming it doesn't exist or already cancelled.`);
        return true;
      }

      try {
        const data = scData.data;

        if (data.order_id === orderId) {
          log.log(`Cancelling order ${orderId} on ${pair_.pairReadable} pair…`);
          return true;
        } else {
          
          log.log(`Failed to cancel order ${orderId} on ${pair_.pairReadable} pair: ${scData?.error_code}. Assuming it doesn't exist or already cancelled.`);
          return true;
        }
      } catch (e) {
        log.warn(`Error while processing cancelOrder(${paramString}) request: ${e}`);
        return undefined;
      }
    },

    /**
     * Cancel all orders on a specific pair
     * @param {String} pair In classic format as BTC/USD
     * @param {String} side Not used for LBANK
     * @returns {Promise<Boolean|undefined>}
     */
    async cancelAllOrders(pair, side = '') {
      const paramString = `pair: ${pair}, side: ${side}`;
      const pair_ = formatPairName(pair);

      let scData;
      
      const openOrders = await this.getOpenOrders(pair);
      const orderIds = openOrders.map(order => order.orderId);

      try {
        scData = await lbankApiClient.cancelOrder(orderIds.join(","), pair_.pairPlain.toLowerCase());
      } catch (err) {
        log.warn(`API request cancelAllOrders(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }

      if(!scData.result || scData.error_code != 0) {
        log.log(`Failed to cancel all orders on ${pair_.pairReadable} pair: ${scData?.error_code}.`);
        return true;
      }

      try {
        const data = scData.data;

        if(orderIds.length == 1) {
          const cancelledOrderId = data.order_id;
          if(!cancelledOrderId) {
            log.log(`Failed to cancel order ${orderIds[0]} on ${pair_.pairReadable}. Assuming it doesn't exist or already cancelled.`);
            return true;
          } else {
            log.log(`Cancelling order ${orderIds[0]} on ${pair_.pairReadable}…`);
            return true;
          }
        }
        const canceledOrdersIds = data.success?.length > 0? data.success?.split(",") : [];
        const failedOrdersIds = data.error?.legnth > 0? data.error?.split(",") : [];

        if(failedOrdersIds.length) {
          log.log(`Failed to cancel ${failedOrdersIds.length} orders on ${pair_.pairReadable} failed order ids: ${data.error}.`);
          return true;
        }

        if (canceledOrdersIds.length) {
          log.log(`Cancelling all ${orderIds.length} orders on ${pair_.pairReadable}`);
          return true;
        } else {
          log.log(`Cancelling all orders on ${pair_.pairReadable} failed order ids: ${data.error}.`);
          return true;
        }
      } catch (e) {
        log.warn(`Error while processing cancelAllOrders(${paramString}) request: ${e}`);
        return undefined;
      }
    },

    /**
     * Places an order
     * Note: market orders are not supported via API
     * @param {String} side 'buy' or 'sell'
     * @param {String} pair In classic format like BTC/USD
     * @param {Number} price Order price
     * @param {Number} coin1Amount Base coin amount. Provide either coin1Amount or coin2Amount.
     * @param {Number} limit StakeCube supports only limit orders
     * @param {Number} coin2Amount Quote coin amount. Provide either coin1Amount or coin2Amount.
     * @returns {Promise<unknown>|undefined}
     */
    async placeOrder(side, pair, price, coin1Amount, limit = 1, coin2Amount) {
      const paramString = `side: ${side}, pair: ${pair}, price: ${price}, coin1Amount: ${coin1Amount}, limit: ${limit}, coin2Amount: ${coin2Amount}`;

      const marketInfo = this.marketInfo(pair);

      let message;

      if (!marketInfo) {
        message = `Unable to place an order on ${exchangeName} exchange. I don't have info about market ${pair}.`;
        log.warn(message);
        return {
          message,
        };
      }

      // for Limit orders, calculate coin1Amount if only coin2Amount is provided
      if (!coin1Amount && coin2Amount && price) {
        coin1Amount = coin2Amount / price;
      }

      // for Limit orders, calculate coin2Amount if only coin1Amount is provided
      let coin2AmountCalculated;
      if (!coin2Amount && coin1Amount && price) {
        coin2AmountCalculated = coin1Amount * price;
      }

      if (coin1Amount) {
        coin1Amount = +(+coin1Amount).toFixed(marketInfo.coin1Decimals);
      }
      if (coin2Amount) {
        coin2Amount = +(+coin2Amount).toFixed(marketInfo.coin2Decimals);
      }
      if (price) {
        price = +(+price).toFixed(marketInfo.coin2Decimals);
      }

      if (coin1Amount && coin1Amount < marketInfo.coin1MinAmount) { // coin1Amount may be null
        message = `Unable to place an order on ${exchangeName} exchange. Order amount ${coin1Amount} ${marketInfo.coin1} is less minimum ${marketInfo.coin1MinAmount} ${marketInfo.coin1} on ${marketInfo.pairReadable} pair.`;
        log.warn(message);
        return {
          message,
        };
      }

      if (coin2Amount && coin2Amount < marketInfo.coin2MinAmount) { // coin2Amount may be null, and skip coin2AmountCalculated checking, it's for market order only
        message = `Unable to place an order on ${exchangeName} exchange. Order volume ${coin2Amount} ${marketInfo.coin2} is less minimum ${marketInfo.coin2MinAmount} ${marketInfo.coin2} on ${marketInfo.pairReadable} pair.`;
        log.warn(message);
        return {
          message,
        };
      }

      const order = {};
      let output;

      if (limit) { // Limit order
        const pairName = formatPairName(pair);
        output = `${side} ${coin1Amount} ${pairName.coin1} at ${price} ${pairName.coin2}.`;

        const order = {};
        let orderId;
        let errorMessage;
        let scData;
        let filledNote = '';

        try {
          scData = await lbankApiClient.addOrder(marketInfo.pairPlain.toLowerCase(), side, price, coin1Amount);

          if(!scData.result || scData.error_code !== 0) {
            message = `API request addOrder(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${scData?.error_code}.`;
            log.warn(message);
            order.orderId = false;
            order.message = message;
            return order;
          };
          const response = scData.data;

          orderId = response?.order_id;
          errorMessage = scData?.error_code;
        } catch (err) {
          message = `API request addOrder(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}.`;
          log.warn(message);
          order.orderId = false;
          order.message = message;

          return order;
        }

        if (orderId) {
          message = `Order placed to ${output} Order Id: ${orderId}.${filledNote}`;
          log.info(message);
          order.orderId = orderId;
          order.message = message;
        } else {
          const details = errorMessage ? ` Details: ${utils.trimAny(errorMessage, ' .')}.` : ' { No details }.';
          message = `Unable to place order to ${output}${details} Check parameters and balances.`;
          log.warn(message);
          order.orderId = false;
          order.message = message;
        }

        return order;
      } else { // Market order
        message = `Unable to place order to ${output} ${exchangeName} doesn't support Market orders.`;
        log.warn(message);
        order.orderId = false;
        order.message = message;
        return order;
      }
    },

    /**
     * Get deposit address for specific coin
     * @param coin e.g. usdt
     * @returns {Promise<[]|undefined>}
     */
    async getDepositAddress(coin) {
      const paramString = `coin: ${coin}`;

      let scData;
      try {
        scData = await lbankApiClient.getDepositAddress(coin.toLowerCase());
      } catch (err) {
        log.warn(`API request getDepositAddress(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }
      if(!scData.result || scData.error_code !== 0) {
        log.warn(`API request getDepositAddress(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${scData.error_code}`);
        return undefined;
      }
      const userData = scData.data;
      return [{ network: userData.netWork, address: userData.address }];
    },

    /**
     * Get trade details for a market rates
     * @param {String} pair In classic format as BTC/USD
     * @returns {Promise<Object|undefined>}
     */
    async getRates(pair) {
      const paramString = `pair: ${pair}`;
      const pair_ = formatPairName(pair);

      let scTickerData;

      try {
        scTickerData = await lbankApiClient.ticker(pair_.pairPlain.toLowerCase());
      } catch (err) {
        log.warn(`API request getRates-ticker(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }

      if(!scTickerData.result || scTickerData.error_code != 0) {
        log.warn(`API request getRates-ticker(${paramString}) of ${utils.getModuleName(module.id)} module failed. error code: ${scTickerData.error_code}`);
        return undefined;
      }

      if(!scTickerData.data[0]) {
        log.warn(`API request getRates-ticker(${paramString}) of ${utils.getModuleName(module.id)} module failed. ticker list is void`);
        return undefined;
      }

      const ticker = scTickerData.data[0].ticker;

      let scOrderBookData;
      try {
        scOrderBookData = await lbankApiClient.orderBook(pair_.pairPlain.toLowerCase());
      } catch (err) {
        log.warn(`API request getRates-orderBook(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }

      if(!scOrderBookData.result || scOrderBookData.error_code != 0) {
        log.warn(`API request getRates-orderBook(${paramString}) of ${utils.getModuleName(module.id)} module failed. error code: ${scOrderBookData.error_code}`);
        return undefined;
      }
      const orderBook = scOrderBookData.data;

      

      try {

        return {
          ask: +orderBook.asks[orderBook.asks.length - 1][0], // assuming asks are sorted in descending order by price. We need the lowest ask
          bid: +orderBook.bids[0][0], // assuming bids are sorted in descending order by price. We need the highest bid
          volume: +ticker.vol,
          volumeInCoin2: +ticker.turnover,
          high: +ticker.high,
          low: +ticker.low,
          last: +ticker.latest,
        };
      } catch (e) {
        log.warn(`Error while processing getRates(${paramString}) request: ${e}`);
        return undefined;
      }
    },

    /**
     * Get market depth
     * @param {String} pair In classic format as BTC/USDT
     * @returns {Promise<Object|undefined>}
     */
    async getOrderBook(pair) {
      const paramString = `pair: ${pair}`;
      const pair_ = formatPairName(pair);

      let scData;
      try {
        scData = await lbankApiClient.orderBook(pair_.pairPlain.toLowerCase());
      } catch (err) {
        log.warn(`API request getOrderBook(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }

      if(!scData.result || scData.error_code != 0) {
        log.warn(`API request getTradesHistory(${paramString}) of ${utils.getModuleName(module.id)} module failed. error code: ${scData.error_code}`);
        return undefined;
      }

      const book = scData.data;

      try {
        const result = {
          bids: [],
          asks: [],
        };

        book.asks.forEach((crypto) => {
          result.asks.push({
            amount: +crypto[1],
            price: +crypto[0],
            count: 1,
            type: 'ask-sell-right',
          });
        });
        result.asks.sort((a, b) => {
          return parseFloat(a.price) - parseFloat(b.price);
        });

        book.bids.forEach((crypto) => {
          result.bids.push({
            amount: +crypto[1],
            price: +crypto[0],
            count: 1,
            type: 'bid-buy-left',
          });
        });
        result.bids.sort((a, b) => {
          return parseFloat(b.price) - parseFloat(a.price);
        });

        return result;
      } catch (e) {
        log.warn(`Error while processing orderBook(${paramString}) request: ${e}`);
        return undefined;
      }
    },

    /**
     * Get trades history
     * @param {String} pair In classic format as BTC/USDT
     * @param {Number} limit Number of records to return
     * @returns {Promise<[]|undefined>}
     */
    async getTradesHistory(pair, limit) {
      const paramString = `pair: ${pair}`;
      const pair_ = formatPairName(pair);

      let scData = [];
      try {
        scData = await lbankApiClient.getTradesHistory(pair_.pairPlain.toLowerCase(), limit);
      } catch (err) {
        log.warn(`API request getTradesHistory(${paramString}) of ${utils.getModuleName(module.id)} module failed. ${err}`);
        return undefined;
      }

      if(!scData.result || scData.error_code != 0) {
        log.warn(`API request getTradesHistory(${paramString}) of ${utils.getModuleName(module.id)} module failed. error code: ${scData.error_code}`);
        return undefined;
      }

      const trades = scData.data;

      try {
        const result = [];

        trades.forEach((trade) => {
          result.push({
            coin1Amount: +trade.amount, // amount in coin1
            price: +trade.price, // trade price
            coin2Amount: +trade.amount * +trade.price, // quote in coin2
            date: trade.date_ms, // timestamp in milliseconds
            type: trade.type, // buy or sell or any other kind
            tradeId: trade.tid,
          });
        });

        // We need ascending sort order
        result.sort((a, b) => {
          return parseFloat(a.date) - parseFloat(b.date);
        });

        return result;
      } catch (e) {
        log.warn(`Error while processing getTradesHistory(${paramString}) request: ${e}`);
        return undefined;
      }
    },
  };
};

/**
 * Returns pair in StakeCube format like BTC_USDT
 * @param pair Pair in any format
 * @returns {Object} Pair, coin1, coin2
 */
function formatPairName(pair) {
  pair = pair?.toUpperCase();

  if (pair.indexOf('-') > -1) {
    pair = pair.replace('-', '_').toUpperCase();
  } else {
    pair = pair.replace('/', '_').toUpperCase();
  }

  const [coin1, coin2] = pair.split('_');

  return {
    pair,
    pairPlain: pair,
    pairReadable: `${coin1}/${coin2}`,
    coin1,
    coin2,
  };
}

/**
 * Returns pair in classic format like BTC/USDT
 * @param pair Pair in format BTC_USDT
 * @returns {Object}
 */
function deformatPairName(pair) {
  pair = pair?.toUpperCase();

  const [coin1, coin2] = pair.split('_');

  return {
    pair: `${coin1}_${coin2}`, // BTC_USDT
    pairReadable: `${coin1}/${coin2}`, // BTC/USDT
    coin1,
    coin2,
  };
}

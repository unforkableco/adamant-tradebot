const assert = require('assert');
const traderApi = require('../trade/trader_lbank');
const chai = require("chai");

const logger = {
  info: function (msg) {
    console.log(msg);
  },
  warn: function (msg) {
    console.log(msg);
  },
  error: function (msg) {
    console.log(msg);
  },
  log: function (msg) {
    console.log(msg);
  }
};

let api;

describe('Trader API', function () {
  before(async function () {
    api = traderApi("1d44b1f1-9999-4b42-b426-4c5f0218990f", "", null, logger, false, false);
    await api.getMarkets(); // manually load markets here so we can wait for it to finish properly before running the other tests which are using cache data
  });

  describe('features()', function () {
    it('should return the properly implemented features', async function () {
      const features = await api.features();
      assert.ok(features.getMarkets);
      assert.ok(features.getDepositAddress);
      assert.ok(features.createDepositAddressWithWebsiteOnly);
      assert.ok(features.amountForMarketOrderNecessary);
    });
  });

  describe('getMarkets()', function () {
    it('should return market data', async function () {
      const res = await api.getMarkets('CXS/USDT');
      assert.ok(res.pairReadable == "CXS/USDT");
      assert.ok(res.pairPlain == "CXS_USDT");
      assert.ok(res.coin1 == "CXS");
      assert.ok(res.coin2 == "USDT");
      assert.ok(res.coin1Decimals == 2);
      assert.ok(res.coin2Decimals == 6);
      assert.ok(res.coin1Precision == 0.01);
      assert.ok(res.coin2Precision == 0.000001);
    });
  });

  describe('getBalances()', function () {
    it('should return all account non null balances', async function () {
      const balances = await api.getBalances();
      assert.ok(balances.length == 2); // only usdt and cxs here
      console.log(balances)
    });
  });

  describe('getDepositAddress()', function () {
    it('should return deposit address for usdt', async function () {
      const deposit = await api.getDepositAddress("usdt");
      assert.ok(deposit[0].network == "trc20");
    });
  });

  let orderId = null;

  describe('placeOrder()', function () {
    it('should open a limit order to sell CXS for USDT', async function () {
      // sell 10 cxs for 1 usdt each, should never be filled
      const order = await api.placeOrder('sell','CXS/USDT', 1, 10);
      orderId = order.orderId;
    });

    it('should open a limit order to buy CXS with USDT', async function () {
      // buy 10 cxs for 0.00001 usdt each, should never be filled
      const order = await api.placeOrder('buy','CXS/USDT', 0.00001, 10);
    });

    it('should open a limit order to buy CXS with USDT with a specific amount of USDT', async function () {
      // buy X cxs for 0.00001 usdt each for 10 USDT worth
      const order = await api.placeOrder('buy','CXS/USDT', 0.00001, null, 1, 10);
    });
  });

  describe('getOpenOrders()', function () {
    it('should return all open orders for CXS/USDT', async function () {
      const orders = await api.getOpenOrders('CXS/USDT');
      assert.ok(orders.length > 1);
      //assert.ok(orders[0].orderId == orderId);
    });
  });

  describe('getOrderBook()', function () {
    it('should return order book depth', async function () {
      const book = await api.getOrderBook('CXS/USDT');
      assert.ok(book.asks.length > 0);
      assert.ok(book.bids.length > 0);
    });
  });

  describe('getRates()', function () {
    it('should return trade details for market rates', async function () {
      const rates = await api.getRates('CXS/USDT');
      assert.ok(rates.volume > 0);
    });
  });

  describe('cancel orders', function () {
    it('should cancel the order created previously', async function () {
      const result = await api.cancelOrder(orderId, 'sell','CXS/USDT');
      assert.ok(result);
    });

    it('should cancel all orders of a specific pair', async function () {
      this.timeout(10000);
      const result = await api.cancelAllOrders('CXS/USDT');
      assert.ok(result);
    });
  });

  describe('getTradesHistory()', function () {
    it('should return all past transactions on a pair', async function () {
      const trades = await api.getTradesHistory('CXS/USDT', 100);
      assert.ok(trades.length > 1);
    });
  });

});

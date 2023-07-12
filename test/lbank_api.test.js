const assert = require('assert');
const exchangeApi = require('../trade/api/lbank_api');
const chai = require("chai");

let api = exchangeApi();

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

describe('Exchange API', function () {
  before(function () {
    // Setup any necessary configurations or test data
    //this.timeout(10000); // Set the timeout to 5 seconds for all test cases in this suite
    api.setConfig(null, "1d44b1f1-9999-4b42-b426-4c5f0218990f", "", logger, null);
  });

  after(function () {
    // Clean up after the tests if needed
  });

  describe('getUserData()', function () {
    it('should return user data', async function () {
      const userData = await api.getUserData();
      assert.ok(userData);
    });
  });

  describe('getDepositAddress()', function () {
    it('should return deposit address for usdt', async function () {
      const depositAddr = await api.getDepositAddress("usdt");
      assert.ok(depositAddr);
    });
  });

  describe('orderBook()', function () {
    it('should return all orders', async function () {
      const orders = await api.orderBook('cxs_usdt');
      console.log("orders", orders);
    });
  });

  describe('getTradesHistory()', function () {
    it('should return trade history for a pair', async function () {
      const trades = await api.getTradesHistory('cxs_usdt');
      console.log("trades", trades);
    });
  });

  describe('markets()', function () {
    it('should return trade history for a pair', async function () {
      const markets = await api.markets();
      console.log("markets", markets);
    });
  });

  describe('ticker()', function () {
    it('should return info on a specified market', async function () {
      const ticker = await api.ticker('cxs_usdt');
      console.log("ticker", ticker);
    });
  });

  // Add more test cases for other functions

});

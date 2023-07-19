const crypto = require('crypto');
const axios = require('axios');

module.exports = function () {
  let WEB_BASE = 'https://api.lbkex.com/v2';
  let config = {
    apiKey: '',
    secretKey: ''
  };
  let log = {};

  // In case if error message includes these words, consider request as failed
  const doNotResolveErrors = [
    'nonce', // ~invalid nonce. last nonce used: 1684169723966
    'pending', // ~pending process need to finish
  ];

  /**
   * Handles response from API
   * @param {Object} responseOrError
   * @param resolve
   * @param reject
   * @param {String} bodyString
   * @param {String} queryString
   * @param {String} url
   */
  const handleResponse = (
    responseOrError,
    resolve,
    reject,
    bodyString,
    queryString,
    url
  ) => {
    const httpCode =
      responseOrError?.status || responseOrError?.response?.status;
    const httpMessage =
      responseOrError?.statusText || responseOrError?.response?.statusText;

    const lbankData = responseOrError?.data || responseOrError?.response?.data;

    const lbankStatus = lbankData?.success;
    const lbankError = lbankData?.error_code;

    const lbankErrorInfo = lbankStatus ? '[No error code]' : `[${lbankError}]`;
    const errorMessage = httpCode
      ? `${httpCode} ${httpMessage}, ${lbankErrorInfo}`
      : String(responseOrError);
    const reqParameters = queryString || bodyString || '{ No parameters }';

    try {
      if (!lbankError || lbankError === '0') {
        resolve(lbankData);
      } else if ([200, 201].includes() && lbankData) {
        if (doNotResolveErrors.some((e) => lbankError.includes(e))) {
          lbankData.errorMessage = errorMessage;
          log.warn(
            `Request to ${url} with data ${reqParameters} failed: ${errorMessage}. Rejecting…`
          );
          reject(errorMessage);
        } else {
          lbankData.errorMessage = errorMessage;
          log.log(
            `LBANK processed a request to ${url} with data ${reqParameters}, but with error: ${errorMessage}. Resolving…`
          );
          resolve(lbankData);
        }
      } else if ([404].includes(httpCode)) {
        log.warn(
          `Request to ${url} with data ${reqParameters} failed: ${errorMessage}. Not found. Rejecting…`
        );
        reject(errorMessage);
      } else {
        log.warn(
          `Request to ${url} with data ${reqParameters} failed: ${errorMessage}. Rejecting…`
        );
        reject(errorMessage);
      }
    } catch (e) {
      log.warn(
        `Error while processing response of request to ${url} with data ${reqParameters}: ${e}. Data object I've got: ${JSON.stringify(
          lbankData
        )}.`
      );
      reject(
        `Unable to process data: ${JSON.stringify(lbankData)}. ${e}`
      );
    }
  };
  
  function getQueryString(data) {
    const params = [];
    const keys = Object.keys(data).sort();
    for (const key of keys) {
      const value = data[key];
      params.push(`${key}=${value}`);
    }
    return params.join('&');
  }

  /**
   * Makes a request to private (auth) endpoint
   * @param {String} path Endpoint
   * @param {Object} data Request params
   * @param {String} type Request type: get, post, delete
   * @returns {Promise}
   */
  function protectedRequest(path, data, type = 'get') {
    let url = `${WEB_BASE}${path}`;
    const urlBase = url;

    data['api_key'] = config.apiKey;
    data['timestamp'] = Date.now();
    data['signature_method'] = 'HmacSHA256';
    data['echostr'] = crypto.randomBytes(16).toString('hex');

    let queryString = getQueryString(data);

    try {
      const md5 = data => crypto.createHash('md5').update(data).digest("hex").toUpperCase();
      const sign = setSign(md5(queryString));

      queryString = queryString + `&sign=${sign}`;
    } catch (e) {
      log.error(`Error while generating request signature: ${e}`);
      return Promise.reject(e);
    }

    const bodyString = queryString;

    if (queryString && type !== 'post') {
      url = url + '?' + queryString;
    }

    return new Promise((resolve, reject) => {
      const httpOptions = {
        url,
        method: type,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: type === 'get' || type === 'delete' ? undefined : bodyString,
      };

      axios(httpOptions)
        .then((response) =>
          handleResponse(
            response,
            resolve,
            reject,
            bodyString,
            queryString,
            urlBase
          )
        )
        .catch((error) =>
          handleResponse(
            error,
            resolve,
            reject,
            bodyString,
            queryString,
            urlBase
          )
        );
    });
  }

  /**
   * Makes a request to public endpoint
   * @param {String} path Endpoint
   * @param {Object} data Request params
   * @param {String} path Endpoint
   * @returns {Promise}
   */
  function publicRequest(path, data, type = 'get') {
    let url = `${WEB_BASE}${path}`;
    const urlBase = url;

    const params = [];
    for (const key in data) {
      const value = data[key];
      params.push(`${key}=${value}`);
    }

    const queryString = params.join('&');
    if (queryString && type !== 'post') {
      url = url + '?' + queryString;
    }

    return new Promise((resolve, reject) => {
      const httpOptions = {
        url,
        method: type,
        timeout: 20000,
      };

      axios(httpOptions)
        .then((response) =>
          handleResponse(
            response,
            resolve,
            reject,
            undefined,
            queryString,
            urlBase
          )
        )
        .catch((error) =>
          handleResponse(
            error,
            resolve,
            reject,
            undefined,
            queryString,
            urlBase
          )
        );
    });
  }

  /**
   * Sign string
   * @param {String} str
   * @returns {String}
   */
  function setSign(str) {
    return crypto.createHmac('sha256', config.secretKey).update(str).digest('hex');
  }

  const EXCHANGE_API = {
    setConfig(apiServer, apiKey, secretKey, logger, publicOnly = false) {
      if (apiServer) {
        WEB_BASE = apiServer;
      }

      if (logger) {
        log = logger;
      }

      if (!publicOnly) {
        config = {
          apiKey,
          secretKey
        };
      }
    },

    /**
     * Account: Returns general information about your LBANK account, including wallets, balances, fee-rate in percentage, and your account username
     * @return {Promise<Object>}
     */
    getUserData() {
      return protectedRequest('/supplement/user_info_account.do', {}, 'post');
    },

    /**
     * Return deposit address
     * @param {String} asset Asset symbol
     * @return {Promise<Object>}
     */
    getDepositAddress(asset) {
      const data = {
        assetCode: asset
      };
      return protectedRequest('/get_deposit_address.do', data, 'post');
    },

    /**
     * Returns a list of your currently open orders, their IDs, their market pair, and other relevant order information
     * @param {String} symbol Trading pair in LBANK format, e.g., btc_usdt
     * @param {Number} limit Number of records to return. Default is 100.
     * @param {String} status Order status filter
     * -1 ：Cancelled
     *  0 ：on trading
     *  1 ： filled partially
     *  2 ：Filled totally
     *  3 ：filled partially and cancelled
     *  4 ：Cancelling
     * @return {Promise<Object>}
     */
    getOrders(symbol, limit = 100, status = '0') {
      const data = {
        symbol,
        current_page: 1,
        page_length: limit,
        status
      };

      return protectedRequest('/orders_info_history.do', data, 'post');
    },

    /**
     * Creates an exchange limit order on the chosen market, side, price, and amount
     * @param {String} symbol Trading pair in LBANK format, e.g., btc_usdt
     * @param {String} side 'buy' or 'sell'
     * @param {String} price Order price
     * @param {String} amount Order amount
     * @return {Promise<Object>}
     */
    addOrder(symbol, side, price, amount) {
      const data = {
        symbol,
        type: side,
        price,
        amount,
      };

      return protectedRequest('/create_order.do', data, 'post');
    },

    /**
     * Cancels an order by its unique ID
     * @param {String} orderId Order ID or multiple comma-separated order IDs
     * @param {String} symbol Trading pair in LBANK format, e.g., btc_usdt
     * @return {Promise<Object>}
     */
    cancelOrder(orderId, symbol) {
      const data = {
        order_id: orderId,
        symbol
      };

      return protectedRequest('/cancel_order.do', data, 'post');
    },

    /**
     * Returns order book data for a specified market pair
     * @param {String} symbol Trading pair in LBANK format, e.g., btc_usdt
     * @param {Number} limit Number of records to return. Default is 200.
     * @return {Promise<Object>}
     */
    orderBook(symbol, limit = 200) {
      const data = {
        symbol,
        size: limit
      };

      return publicRequest('/depth.do', data, 'get');
    },

    /**
     * Returns the last trades of a specified market pair
     * @param {String} symbol Trading pair in LBANK format, e.g., btc_usdt
     * @param {Number} size Number of records to return. Default is 100. max 200
     * @return {Promise<Array<Object>>} Last trades
     */
    getTradesHistory(symbol, size = 100) {
      const data = {
        symbol,
        size
      };

      return publicRequest('/trades.do', data, 'get');
    },

    /**
     * Returns a list of all markets
     * @return {Promise<Object>}
     */
    markets() {
      return publicRequest('/accuracy.do', {}, 'get');
    },

    /**
     * Returns info on a specified market
     * @param {String} symbol Trading pair in LBANK format, e.g., btc_usdt
     * @return {Promise<Object>}
     */
    ticker(symbol) {
      const data = {
        symbol,
      };

      return publicRequest('/ticker.do', data, 'get');
    },
  };

  return EXCHANGE_API;
};

module.exports.axios = axios; // for setup axios mock adapter

const { default: axios } = require('axios');
const cron = require('node-cron');
const redis = require('./helpers/redis');
const supportedCoins = require('./supportedCoins');
const coinGeckoCoinPriceAPI = 'https://api.coingecko.com/api/v3/simple/price';
const coinGeckoTokenPriceAPI = 'https://api.coingecko.com/api/v3/simple/token_price/:id';
const _constants = { INCREASE: 'INCREASE', DECREASE: 'DECREASE' };
const { ASSETS_URL } = require('./env');
const Processes = require('./chains/processesService');
const log = require('./log');

function fetchAddressesOnEthereum() {
  return axios.get(`${ASSETS_URL}/assets/tokens/ethereum/addresses`).then(res => {
    if (res.status >= 400) throw new Error(`API responded with ${res.status}`);
    return res.data.result;
  });
}

function fetchAddressesOnBinance() {
  return axios.get(`${ASSETS_URL}/assets/tokens/binance/addresses`).then(res => {
    if (res.status >= 400) throw new Error(`API responded with ${res.status}`);
    return res.data.result;
  });
}

class CronService {
  static _fetchCoinListFromCoinGecko() {
    cron
      .schedule('* * * * *', async () => {
        try {
          const _coinsListResp = await axios.get('https://api.coingecko.com/api/v3/coins/list');
          const _val = await redis.simpleSet(
            'coinslist',
            JSON.stringify(_coinsListResp.data.filter(item => supportedCoins.some(v => new RegExp(v).test(item.name))))
          );
          log('Redis response: %s', _val);
        } catch (error) {
          log('cron: %s', error.message);
        }
      })
      .start();
  }

  static _fetchCoinPrices() {
    cron
      .schedule('*/2 * * * *', async () => {
        try {
          const _exists = await redis.exists('coinslist');

          if (_exists) {
            const _redisResult = await redis.simpleGet('coinslist');
            const _coinsList = JSON.parse(_redisResult).map(coin => coin.id);
            const priceResp = await axios.get(
              `${coinGeckoCoinPriceAPI}?ids=${_coinsList.join(',')}&vs_currencies=usd&include_24hr_change=true`
            );
            const result = priceResp.data;
            let record;
            const _exists = await redis.exists('prices');

            if (_exists) {
              const _prices = await redis.simpleGet('prices');
              record = JSON.parse(_prices);
            } else record = {};

            for (const id of _coinsList) {
              const _lowerId = id.toLowerCase();

              if (
                !!record[_lowerId] &&
                !!record[_lowerId].price &&
                !!record[_lowerId]._type &&
                !!record[_lowerId]._percentage
              ) {
                const _type =
                  result[_lowerId]['usd'] > record[_lowerId].price ? _constants.INCREASE : _constants.DECREASE;
                record = {
                  ...record,
                  [_lowerId]: {
                    _type,
                    _percentage:
                      _type === _constants.INCREASE
                        ? ((result[_lowerId]['usd'] - record[_lowerId].price) / result[_lowerId]['usd']) * 100
                        : ((record[_lowerId].price - result[_lowerId]['usd']) / record[_lowerId].price) * 100,
                    price: result[_lowerId]['usd']
                  }
                };
              } else {
                record = {
                  ...record,
                  [_lowerId]: {
                    _type: _constants.INCREASE,
                    _percentage: 0,
                    price: result[_lowerId]['usd']
                  }
                };
              }
            }
            const _val = await redis.simpleSet('prices', JSON.stringify(record));
            log('Redis response: %s', _val);
          }
        } catch (error) {
          log('cron: %s', error.message);
        }
      })
      .start();
  }

  /**
   *
   * @param {Array<string>} addresses
   */
  static _fetchPricesOnBscChain(addresses) {
    cron
      .schedule('*/30 * * * * *', async () => {
        try {
          const priceResp = await axios.get(
            `${coinGeckoTokenPriceAPI.replace(':id', 'binance-smart-chain')}?contract_addresses=${addresses.join(
              ','
            )}&vs_currencies=usd&include_24hr_change=true`
          );
          const result = priceResp.data;
          let record;
          const _exists = await redis.exists('prices');

          if (_exists) {
            const _prices = await redis.simpleGet('prices');
            record = JSON.parse(_prices);
          } else record = {};

          for (const id of addresses) {
            const _lowerId = id.toLowerCase();

            if (
              !!record[_lowerId] &&
              !!record[_lowerId].price &&
              !!record[_lowerId]._type &&
              !!record[_lowerId]._percentage
            ) {
              const _type =
                result[_lowerId]['usd'] > record[_lowerId].price ? _constants.INCREASE : _constants.DECREASE;
              record = {
                ...record,
                [_lowerId]: {
                  _type,
                  _percentage:
                    _type === _constants.INCREASE
                      ? ((result[_lowerId]['usd'] - record[_lowerId].price) / result[_lowerId]['usd']) * 100
                      : ((record[_lowerId].price - result[_lowerId]['usd']) / record[_lowerId].price) * 100,
                  price: result[_lowerId]['usd']
                }
              };
            } else {
              record = {
                ...record,
                [_lowerId]: {
                  _type: _constants.INCREASE,
                  _percentage: 0,
                  price: result[_lowerId]['usd']
                }
              };
            }
          }
          const _val = await redis.simpleSet('prices', JSON.stringify(record));
          log('Redis response: %s', _val);
        } catch (error) {
          log('cron: %s', error.message);
        }
      })
      .start();
  }

  /**
   *
   * @param {Array<string>} addresses
   */
  static _fetchPricesOnEthChain(addresses) {
    cron
      .schedule('*/30 * * * * *', async () => {
        try {
          const priceResp = await axios.get(
            `${coinGeckoTokenPriceAPI.replace(':id', 'ethereum')}?contract_addresses=${addresses.join(
              ','
            )}&vs_currencies=usd&include_24hr_change=true`
          );
          const result = priceResp.data;
          let record;
          const _exists = await redis.exists('prices');

          if (_exists) {
            const _prices = await redis.simpleGet('prices');
            record = JSON.parse(_prices);
          } else record = {};

          for (const id of addresses) {
            const _lowerId = id.toLowerCase();

            if (
              !!record[_lowerId] &&
              !!record[_lowerId].price &&
              !!record[_lowerId]._type &&
              !!record[_lowerId]._percentage
            ) {
              const _type =
                result[_lowerId]['usd'] > record[_lowerId].price ? _constants.INCREASE : _constants.DECREASE;
              record = {
                ...record,
                [_lowerId]: {
                  _type,
                  _percentage:
                    _type === _constants.INCREASE
                      ? ((result[_lowerId]['usd'] - record[_lowerId].price) / result[_lowerId]['usd']) * 100
                      : ((record[_lowerId].price - result[_lowerId]['usd']) / record[_lowerId].price) * 100,
                  price: result[_lowerId]['usd']
                }
              };
            } else {
              record = {
                ...record,
                [_lowerId]: {
                  _type: _constants.INCREASE,
                  _percentage: 0,
                  price: result[_lowerId]['usd']
                }
              };
            }
          }
          const _val = await redis.simpleSet('prices', JSON.stringify(record));
          log('Redis response: %s', _val);
        } catch (error) {
          log('cron: %s', error.message);
        }
      })
      .start();
  }

  /**
   *
   * @param {(name: string, item: any) => void} cb
   */
  static _retrievePricesFromStore(cb) {
    cron
      .schedule('/2 * * * * *', async () => {
        try {
          let _record;
          const _exists = await redis.exists('prices');

          if (_exists) {
            _record = await redis.simpleGet('prices');
            _record = JSON.parse(_record);
          } else _record = {};
          cb('price', _record);
        } catch (error) {
          log('cron: %s', error.message);
        }
      })
      .start();
  }

  static async _initAllProcesses() {
    try {
      const [ethereumAddresses, binanceAddresses] = await Promise.all([
        fetchAddressesOnEthereum(),
        fetchAddressesOnBinance()
      ]);
      this._fetchCoinListFromCoinGecko();
      this._fetchCoinPrices();
      this._fetchPricesOnEthChain(ethereumAddresses);
      this._fetchPricesOnBscChain(binanceAddresses);
    } catch (error) {
      log('cron: %s', error.message);
    }
  }
}

module.exports = CronService;

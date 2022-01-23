const { default: axios } = require('axios');
const cron = require('node-cron');
const redis = require('./helpers/redis');
const supportedCoins = require('./supportedCoins');
const coinGeckoCoinPriceAPI = 'https://api.coingecko.com/api/v3/simple/price';
const coinGeckoTokenPriceAPI = 'https://api.coingecko.com/api/v3/simple/token_price/:id';
const _constants = { INCREASE: 'INCREASE', DECREASE: 'DECREASE' };

class CronService {
  static _fetchCoinListFromCoinGecko() {
    cron
      .schedule('* * * * *', async () => {
        const _coinsListResp = await axios.get('https://api.coingecko.com/api/v3/coins/list');
        const _val = await redis.simpleSet(
          'coinslist',
          JSON.stringify(_coinsListResp.data.filter(item => supportedCoins.some(v => new RegExp(v).test(item.name))))
        );
        console.log('Redis response: ', _val);
      })
      .start();
  }

  static _fetchCoinPrices() {
    cron
      .schedule('*/2 * * * *', async () => {
        try {
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
                  _percentage: result[_lowerId]['usd_24h_change'],
                  price: result[_lowerId]['usd']
                }
              };
            } else {
              record = {
                ...record,
                [_lowerId]: {
                  _type: _constants.INCREASE,
                  _percentage: result[_lowerId]['usd_24h_change'],
                  price: result[_lowerId]['usd']
                }
              };
            }
          }
          const _val = await redis.simpleSet('prices', JSON.stringify(record));
          console.log('Redis response: ', _val);
        } catch (error) {
          console.log(error);
        }
      })
      .start();
  }

  static _fetchPricesOnBscChain(addresses) {
    cron
      .schedule('*/2 * * * *', async () => {
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
                  _percentage: result[_lowerId]['usd_24h_change'],
                  price: result[_lowerId]['usd']
                }
              };
            } else {
              record = {
                ...record,
                [_lowerId]: {
                  _type: _constants.INCREASE,
                  _percentage: result[_lowerId]['usd_24h_change'],
                  price: result[_lowerId]['usd']
                }
              };
            }
          }
          const _val = await redis.simpleSet('prices', JSON.stringify(record));
          console.log('Redis response: ', _val);
        } catch (error) {
          console.log(error);
        }
      })
      .start();
  }

  static _fetchPricesOnEthChain() {
    cron
      .schedule('*/2 * * * *', async () => {
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
                  _percentage: result[_lowerId]['usd_24h_change'],
                  price: result[_lowerId]['usd']
                }
              };
            } else {
              record = {
                ...record,
                [_lowerId]: {
                  _type: _constants.INCREASE,
                  _percentage: result[_lowerId]['usd_24h_change'],
                  price: result[_lowerId]['usd']
                }
              };
            }
          }
          const _val = await redis.simpleSet('prices', JSON.stringify(record));
          console.log('Redis response: ', _val);
        } catch (error) {
          console.log(error);
        }
      })
      .start();
  }
}

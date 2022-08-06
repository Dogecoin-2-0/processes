import cron from 'node-cron';
import { multiply, subtract } from 'ramda';
import axios from 'axios';
import log from './log';
import redis from './helpers/redis';
import { redisPriceKey } from './constants';

interface PriceInfo {
  price: number;
  percentageChange: number;
  rateType: 'INCREASE' | 'DECREASE';
}

const coinGeckoRoot = 'https://api.coingecko.com/api/v3';
const assetsAPIRoot = 'http://localhost:8760';

const baseCoinGeckoClient = axios.create({
  baseURL: coinGeckoRoot
});
const baseAssetsClient = axios.create({
  baseURL: assetsAPIRoot
});

export async function fetchTokenPrices() {
  try {
    const tokenMap = new Map<string, PriceInfo>();
    const blockChainList = await baseAssetsClient.get('/assets/list');

    let ids: Array<string> = [];

    for (const chain of blockChainList.data.result) {
      const chainInfo = await baseAssetsClient.get(`/assets/${chain}/info`);
      ids = [...ids, !!chainInfo.data.result.coinGeckoID && chainInfo.data.result.coinGeckoID];

      const assets = await baseAssetsClient.get(`/assets/tokens/${chain}/addresses`);

      for (const asset of assets.data.result) {
        const assetInfo = await baseAssetsClient.get(`/assets/tokens/${chain}/${asset}/info`);
        ids = [...ids, !!assetInfo.data.result.coinGeckoID && assetInfo.data.result.coinGeckoID];
      }
    }

    const priceInfo = await baseCoinGeckoClient.get(`/simple/price?ids=${ids.join()}&vs_currencies=usd`);
    const priceData = priceInfo.data;

    for (const key of Object.keys(priceData)) {
      const valObj = priceData[key];
      const pricingKeyExists = await redis.exists(redisPriceKey);

      if (pricingKeyExists) {
        const pkVal = await redis.getVal(redisPriceKey);

        if (!!pkVal[key]) {
          const map: PriceInfo = JSON.parse(pkVal[key]);
          if (valObj.usd > map.price) {
            const price: number = valObj.usd;
            const percentageChange = multiply(subtract(price, map.price) / price, 100);
            const rateType = 'INCREASE';

            tokenMap.set(key, { price, percentageChange, rateType });
          } else if (valObj.usd < map.price) {
            const price: number = valObj.usd;
            const percentageChange = multiply(subtract(map.price, price) / map.price, 100);
            const rateType = 'DECREASE';

            tokenMap.set(key, { price, percentageChange, rateType });
          }
        } else {
          tokenMap.set(key, { price: valObj.usd, percentageChange: 0, rateType: 'INCREASE' });
        }
      } else {
        tokenMap.set(key, { price: valObj.usd, percentageChange: 0, rateType: 'INCREASE' });
        const mapAsJson = Object.fromEntries(tokenMap);
        await redis.setObjectVal(redisPriceKey, key, mapAsJson[key]);
      }
    }

    const mapAsJson = Object.fromEntries(tokenMap);

    for (const key of Object.keys(mapAsJson)) await redis.setObjectVal(redisPriceKey, key, mapAsJson[key]);

    log('Price updated in store');
  } catch (error: any) {
    log(error.message);
  }
}

export function watchPriceChangeHourly() {
  try {
    cron
      .schedule('* */1 * * *', async () => {
        await fetchTokenPrices();
      })
      .start();
  } catch (error: any) {
    log(error.message);
  }
}

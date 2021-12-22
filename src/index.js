const express = require('express');
const app = express();
const { default: axios } = require('axios');
const Feed = require('./chains/priceFeed');
const { ETH_WEB3_URL, ETH_CONTRACT_ADDRESS, ASSETS_URL } = require('./env');

const server = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const priceRecord = {};
const port = parseInt(process.env.PORT || '16000');

async function fetchIdsOnEthereum() {
  let ids = [];
  const ethInfoRes = await axios.get(`${ASSETS_URL}/assets/ethereum/info`);
  const tokensAddressRes = await axios.get(`${ASSETS_URL}/assets/tokens/ethereum/addresses`);
  ids = [...ids, ethInfoRes.data.result['chainlinkUSDId']];
  for (const address of tokensAddressRes.data.result) {
    const tokenInfoRes = await axios.get(`${ASSETS_URL}/assets/tokens/ethereum/${address}/info`);
    ids = [...ids, tokenInfoRes.data.result['chainlinkUSDId']];
  }
  ids = ids.filter(id => typeof id === 'string');
  return Promise.resolve(ids);
}

async function fetchIdsOnBinance() {
  let ids = [];
  const ethInfoRes = await axios.get(`${ASSETS_URL}/assets/binance/info`);
  const tokensAddressRes = await axios.get(`${ASSETS_URL}/assets/tokens/binance/addresses`);
  ids = [...ids, ethInfoRes.data.result['chainlinkUSDId']];
  for (const address of tokensAddressRes.data.result) {
    const tokenInfoRes = await axios.get(`${ASSETS_URL}/assets/tokens/binance/${address}/info`);
    ids = [...ids, tokenInfoRes.data.result['chainlinkUSDId']];
  }
  ids = ids.filter(id => typeof id === 'string');
  return Promise.resolve(ids);
}

function emitPriceAtIntervalsForETH(ids) {
  const constants = { INCREASE: 'INCREASE', DECREASE: 'DECREASE' };
  const feed = new Feed(ETH_WEB3_URL, ETH_CONTRACT_ADDRESS);
  setInterval(async () => {
    let _record = {};
    for (const id of ids) {
      let price = await feed.fetchPrice(id);
      price = price / 10 ** (await feed.getDecimals(id));
      let _type = constants.INCREASE;
      let _percentage = 0;
      if (!!priceRecord[id]) {
        _percentage =
          priceRecord[id] > price
            ? ((priceRecord[id] - price) * 100) / priceRecord[id]
            : ((price - priceRecord[id]) * 100) / price;
      } else {
        priceRecord[id] = price;
      }
      _type = price > priceRecord[id] ? constants.INCREASE : constants.DECREASE;
      _record = { ..._record, [id]: { _type, _percentage, price } };
      priceRecord[id] = price;
    }
    io.emit('eth_price', { ..._record });
  }, 5000);
}

function emitPriceAtIntervalsForBSC(ids) {
  const constants = { INCREASE: 'INCREASE', DECREASE: 'DECREASE' };
  const feed = new Feed('', '');
  setInterval(async () => {
    let _record = {};
    for (const id of ids) {
      let price = await feed.fetchPrice(id);
      price = price / 10 ** (await feed.getDecimals(id));
      let _type = constants.INCREASE;
      let _percentage = 0;
      if (!!priceRecord[id]) {
        _percentage =
          priceRecord[id] > price
            ? ((priceRecord[id] - price) * 100) / priceRecord[id]
            : ((price - priceRecord[id]) * 100) / price;
      } else {
        priceRecord[id] = price;
      }
      _type = price > priceRecord[id] ? constants.INCREASE : constants.DECREASE;
      _record = { ..._record, [id]: { _type, _percentage, price } };
      priceRecord[id] = price;
    }
    io.emit('bsc_price', { ..._record });
  }, 5000);
}

io.on('connection', async () => {
  const ethIds = await fetchIdsOnEthereum();
  const bscIds = await fetchIdsOnBinance();
  emitPriceAtIntervalsForETH(ethIds);
  emitPriceAtIntervalsForBSC(bscIds);
});

server.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

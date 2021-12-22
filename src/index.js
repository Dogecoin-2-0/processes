const express = require('express');
const app = express();
const { default: axios } = require('axios');
const mongoose = require('mongoose');
const Feed = require('./chains/priceFeed');
const { ETH_WEB3_URL, ETH_CONTRACT_ADDRESS, ASSETS_URL } = require('./env');
const db = require('./db');
const router = express.Router();
const CustomError = require('./custom/error');

router
  .route('/push')
  .post(async (req, res) => {
    try {
      const { address, token } = req.body;
      const sub = await db.models.subscription.getSubscription(address);
      let result;
      if (!!sub) {
        if (sub.token === token) throw new CustomError(400, 'Already subscribed for push');
        result = await db.models.subscription.updateSubscription(address, token);
        return res.status(200).json({ result });
      }

      result = await db.models.subscription.createSubscription({ address, token });
      return res.status(201).json({ result });
    } catch (error) {
      return res.status(error.errorCode || 500).json({ error: error.message });
    }
  })
  .delete(async (req, res) => {
    try {
      const { address } = req.body;

      if (!!address || typeof address !== 'string')
        throw new CustomError(400, 'Expects a string but found ' + typeof address);

      await db.models.subscription.deleteSubscription(address);
      return res.status(200).json({ result: 'DONE' });
    } catch (error) {
      return res.status(error.errorCode || 500).json({ error: error.message });
    }
  });

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, DELETE');
  next();
});
app.use('/', router);

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
  const bscInfoRes = await axios.get(`${ASSETS_URL}/assets/binance/info`);
  const tokensAddressRes = await axios.get(`${ASSETS_URL}/assets/tokens/binance/addresses`);
  ids = [...ids, bscInfoRes.data.result['chainlinkUSDId']];
  for (const address of tokensAddressRes.data.result) {
    const tokenInfoRes = await axios.get(`${ASSETS_URL}/assets/tokens/binance/${address}/info`);
    ids = [...ids, tokenInfoRes.data.result['chainlinkUSDId']];
  }
  ids = ids.filter(id => typeof id === 'string');
  return Promise.resolve(ids);
}

function emitPriceAtIntervalsForETH(ids, socketId) {
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
    io.to(socketId).emit('eth_price', { ..._record });
  }, 5000);
}

function emitPriceAtIntervalsForBSC(ids, socketId) {
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
    io.to(socketId).emit('bsc_price', { ..._record });
  }, 5000);
}

io.on('connection', async socket => {
  const ethIds = await fetchIdsOnEthereum();
  const bscIds = await fetchIdsOnBinance();
  emitPriceAtIntervalsForETH(ethIds, socket.id);
  emitPriceAtIntervalsForBSC(bscIds, socket.id);
});

server.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
  mongoose
    .connect('')
    .then(() => console.log('Mongoose connected'))
    .catch(console.error);
});

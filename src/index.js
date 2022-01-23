const express = require('express');
const app = express();
const { default: axios } = require('axios');
const mongoose = require('mongoose');
const cron = require('node-cron');
const Web3 = require('web3');
const { ASSETS_URL, DB_URI } = require('./env');
const db = require('./db');
const router = express.Router();
const CustomError = require('./custom/error');

router
  .route('/transactions')
  .post(async (req, res) => {
    try {
      const { tx_id, blockchain } = req.body;
      const result = await db.models.tx.addTx(tx_id, blockchain);
      return res.status(201).json({ result });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  })
  .get(async (req, res) => {
    try {
      const { blockchain } = req.query;
      if (!blockchain)
        throw new CustomError(400, "'Blockchain' query parameter is required");

      let result = await db.models.tx.findAllTx();
      result = result.filter(tx => tx.blockchain === blockchain);
      result = result.map(
        async tx => await fetchTxWithHash(tx.tx_id, blockchain)
      );
      result = await Promise.all(result);
      return res.status(200).json({ result });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  })
  .delete(async (req, res) => {
    try {
      const { tx_id } = req.query;
      await db.models.tx.deleteTx(tx_id);
      return res.status(200).json({ result: 'DONE' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

router
  .route('/push')
  .post(async (req, res) => {
    try {
      const { address, token } = req.body;
      const sub = await db.models.subscription.getSubscription(address);
      let result;
      if (!!sub) {
        if (sub.token === token)
          throw new CustomError(400, 'Already subscribed for push');
        result = await db.models.subscription.updateSubscription(
          address,
          token
        );
        return res.status(200).json({ result });
      }

      result = await db.models.subscription.createSubscription({
        address,
        token
      });
      return res.status(201).json({ result });
    } catch (error) {
      return res.status(error.errorCode || 500).json({ error: error.message });
    }
  })
  .delete(async (req, res) => {
    try {
      const { address } = req.body;

      if (!!address || typeof address !== 'string')
        throw new CustomError(
          400,
          'Expects a string but found ' + typeof address
        );

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
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const io = new Server(server);
const supportedCoins = require('./supportedCoins');
let socketIds = [];
const port = parseInt(process.env.PORT || '16000');
const coinGeckoCoinPriceAPI = 'https://api.coingecko.com/api/v3/simple/price';
const coinGeckoTokenPriceAPI =
  'https://api.coingecko.com/api/v3/simple/token_price/:id';
const _constants = { INCREASE: 'INCREASE', DECREASE: 'DECREASE' };

function fetchCoinsListFromCoinGecko() {
  cron
    .schedule('* * * * *', async () => {
      const _coinsListResp = await axios.get(
        'https://api.coingecko.com/api/v3/coins/list'
      );
      fs.writeFileSync(
        path.join(__dirname, 'coinslist.json'),
        JSON.stringify(
          _coinsListResp.data.filter(item =>
            supportedCoins.some(v => new RegExp(v).test(item.name))
          )
        )
      );
    })
    .start();
}

function fetchAddressesOnEthereum() {
  return axios
    .get(`${ASSETS_URL}/assets/tokens/ethereum/addresses`)
    .then(res => {
      if (res.status >= 400)
        throw new Error(`API responded with ${res.status}`);
      return res.data.result;
    });
}

function fetchAddressesOnBinance() {
  return axios
    .get(`${ASSETS_URL}/assets/tokens/binance/addresses`)
    .then(res => {
      if (res.status >= 400)
        throw new Error(`API responded with ${res.status}`);
      return res.data.result;
    });
}

function fetchCoinPricesAtIntervals() {
  cron
    .schedule('*/2 * * * *', async () => {
      try {
        const _coinsList = JSON.parse(
          fs.readFileSync(path.join(__dirname, 'coinslist.json')).toString()
        ).map(coin => coin.id);
        const priceResp = await axios.get(
          `${coinGeckoCoinPriceAPI}?ids=${_coinsList.join(
            ','
          )}&vs_currencies=usd&include_24hr_change=true`
        );
        const result = priceResp.data;
        let record;

        if (fs.existsSync(path.join(__dirname, 'prices.json'))) {
          record = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'prices.json')).toString()
          );
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
              result[_lowerId]['usd'] > record[_lowerId].price
                ? _constants.INCREASE
                : _constants.DECREASE;
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
        fs.writeFileSync(
          path.join(__dirname, 'prices.json'),
          JSON.stringify(record)
        );
      } catch (error) {
        console.log(error);
      }
    })
    .start();
}

function fetchETHPricesAtIntervals(addresses) {
  cron
    .schedule('*/2 * * * *', async () => {
      try {
        const priceResp = await axios.get(
          `${coinGeckoTokenPriceAPI.replace(
            ':id',
            'ethereum'
          )}?contract_addresses=${addresses.join(
            ','
          )}&vs_currencies=usd&include_24hr_change=true`
        );
        const result = priceResp.data;
        let record;

        if (fs.existsSync(path.join(__dirname, 'prices.json'))) {
          record = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'prices.json')).toString()
          );
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
              result[_lowerId]['usd'] > record[_lowerId].price
                ? _constants.INCREASE
                : _constants.DECREASE;
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
        fs.writeFileSync(
          path.join(__dirname, 'prices.json'),
          JSON.stringify(record)
        );
      } catch (error) {
        console.log(error);
      }
    })
    .start();
}

function fetchBSCPricesAtIntervals(addresses) {
  cron
    .schedule('*/2 * * * *', async () => {
      try {
        const priceResp = await axios.get(
          `${coinGeckoTokenPriceAPI.replace(
            ':id',
            'binance-smart-chain'
          )}?contract_addresses=${addresses.join(
            ','
          )}&vs_currencies=usd&include_24hr_change=true`
        );
        const result = priceResp.data;
        let record;

        if (fs.existsSync(path.join(__dirname, 'prices.json'))) {
          record = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'prices.json')).toString()
          );
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
              result[_lowerId]['usd'] > record[_lowerId].price
                ? _constants.INCREASE
                : _constants.DECREASE;
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
        fs.writeFileSync(
          path.join(__dirname, 'prices.json'),
          JSON.stringify(record)
        );
      } catch (error) {
        console.log(error);
      }
    })
    .start();
}

function emitPriceAtIntervals() {
  cron
    .schedule('* * * * *', () => {
      const record = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'prices.json')).toString()
      );
      for (const socketId of socketIds)
        io.to(socketId).emit('price', JSON.stringify({ ...record }));
    })
    .start();
}

async function initializeFetchingAndEmissions() {
  const [ethAddresses, bscAddresses] = await Promise.all([
    fetchAddressesOnEthereum(),
    fetchAddressesOnBinance()
  ]);
  fetchCoinsListFromCoinGecko();
  fetchCoinPricesAtIntervals();
  fetchETHPricesAtIntervals(ethAddresses);
  fetchBSCPricesAtIntervals(bscAddresses);

  emitPriceAtIntervals();
}

io.on('connection', socket => {
  socketIds = [...socketIds, socket.id];
});

io.on('disconnect', socket => {
  socketIds = socketIds.filter(id => id !== socket.id);
});

process.on('exit', () => {
  for (const task of cron.getTasks()) task.stop();
  io.disconnectSockets(true);
});

server.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
  mongoose
    .connect(DB_URI)
    .then(async () => {
      await initializeFetchingAndEmissions();
      console.log('Mongoose connected');
    })
    .catch(console.error);
});

const express = require('express');
const app = express();
const mongoose = require('mongoose');
const { DB_URI } = require('./env');
const db = require('./db');
const router = express.Router();
const CustomError = require('./custom/error');
const _redis = require('./helpers/redis');

router.get('/transactions', async (req, res) => {
  try {
    const { address } = req.query;
    const _exists = await _redis.exists(address);

    if (!_exists) {
      throw new CustomError(404, 'Record not found');
    }
    const result = await _redis.getVal(address);
    Object.keys(result).forEach(val => {
      result[val] = JSON.parse(result[val]);
    });
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/wallet', async (req, res) => {
  try {
    const { address } = req.body;
    let result = await db.models.wallet.getWallet(address);

    if (!!result) {
      return res.status(200).json({ result });
    }
    result = await db.models.wallet.addWallet(address);
    return res.status(201).json({ result });
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
        if (sub.token === token) throw new CustomError(400, 'Already subscribed for push');
        result = await db.models.subscription.updateSubscription(address, token);
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
        throw new CustomError(400, 'Expects a string but found ' + typeof address);

      await db.models.subscription.deleteSubscription(address);
      return res.status(200).json({ result: 'DONE' });
    } catch (error) {
      return res.status(error.errorCode || 500).json({ error: error.message });
    }
  });

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, DELETE');
  next();
});
app.use('/', router);

const server = require('http').createServer(app);
const CronService = require('./cron');
const SocketService = require('./socket');
const ChainProcesses = require('./chains/processesService');
const port = parseInt(process.env.PORT || '3600');
const log = require('./log');

const initAllProcesses = () => {
  SocketService._init(server);
  _redis._initConnection().then(() => {
    CronService._initAllProcesses().then(() => {
      ChainProcesses._initProcesses().then(() => {
        CronService._retrievePricesFromStore(SocketService._emitToAll);
      });
    });
  });
};

server.listen(port, () => {
  log('Server is running on port: %d', port);
  mongoose
    .connect(DB_URI)
    .then(() => {
      initAllProcesses();
      log('Mongoose connected');
    })
    .catch(console.error);
});

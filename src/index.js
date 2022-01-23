const express = require('express');
const app = express();
const mongoose = require('mongoose');
const { DB_URI } = require('./env');
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
      if (!blockchain) throw new CustomError(400, "'Blockchain' query parameter is required");

      let result = await db.models.tx.findAllTx();
      result = result.filter(tx => tx.blockchain === blockchain);
      result = result.map(async tx => await fetchTxWithHash(tx.tx_id, blockchain));
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
const _redis = require('./helpers/redis');

const initAllProcesses = () => {
  SocketService._init(server);
  _redis._initConnection().then(() => {
    CronService._initAllPriceFetching().then(() => {
      CronService._retrievePricesFromStore(SocketService._emitToAll);
    });
  });
};

server.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
  mongoose
    .connect(DB_URI)
    .then(async () => {
      initAllProcesses();
      console.log('Mongoose connected');
    })
    .catch(console.error);
});

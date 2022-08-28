import express from 'express';
import { getAddress } from '@ethersproject/address';
import { id as hashId } from '@ethersproject/hash';
import { forEach, find, map, pick, filter, toLower } from 'ramda';
import * as db from './db';
import CustomError from './custom/error';
import _redis from './helpers/redis';
import chainlist from './chainlist.json';
import { buildProvider } from './utils/provider';
import {
  propagateBlockData,
  syncFromLastProcessedBlock,
  propagateLockedTxCreated,
  propagateTimelockCancelledEvent,
  propagateTimelockProcessedEvent
} from './handlers';
import log from './log';
import { redisPriceKey, timelockTxContract } from './constants';
import { fetchTokenPrices, watchPriceChangeHourly } from './cron';
import redis from './helpers/redis';
import { mapRedisResponsesToIdealTxs } from './utils/misc';

const app: express.Express = express();
const router = express.Router();
const port = parseInt(process.env.PORT || '3600');

// Hashes of events emitted on the timelock contract
const timelockObjectCreatedEvent = hashId(
  'TimelockObjectCreated(bytes32,uint256,address,address,address,uint256,uint256)'
);
const timelockProcessedEvent = hashId('TimelockProcessed(bytes32)');
const timelockCancelledEvent = hashId('TimelockCancelled(bytes32)');

function watchEvents() {
  forEach(chain => {
    const provider = buildProvider(chain.rpcUrl, chain.id);
    const alternateProvider = buildProvider(chain.alternateRpcUrl, chain.id);
    syncFromLastProcessedBlock(chain.id);

    provider.on('block', (blockNumber: number) => propagateBlockData(blockNumber, chain.id)());

    if (!!timelockTxContract[chain.id]) {
      const address = timelockTxContract[chain.id];
      alternateProvider.on({ address, topics: [timelockObjectCreatedEvent] }, propagateLockedTxCreated(chain.id));
      alternateProvider.on({ address, topics: [timelockProcessedEvent] }, propagateTimelockProcessedEvent(chain.id));
      alternateProvider.on({ address, topics: [timelockCancelledEvent] }, propagateTimelockCancelledEvent(chain.id));
    }
  }, chainlist);
}

router.get('/health', async (req, res) => {
  return res.status(200).json({
    status: 'healthy',
    url: req.url
  });
});

router.post('/wallet', async (req, res) => {
  try {
    const { body } = pick(['body'], req);
    const allWallets = await db.models.wallet.findWallets();
    const allWalletsJson = map(wallet => wallet.toJSON(), allWallets);

    let result: any = find(wallet => getAddress(wallet.address) === getAddress(body.address), allWalletsJson);

    if (typeof result !== 'undefined') {
      return res.status(200).json({ result });
    }
    result = await db.models.wallet.addWallet({ address: body.address });
    result = result.toJSON();
    return res.status(201).json({ result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/wallet/:id', async (req, res) => {
  try {
    const { params } = pick(['params'], req);
    const allWallets = await db.models.wallet.findWallets();
    const allWalletsJson = map(wallet => wallet.toJSON(), allWallets);
    const result = allWalletsJson.find(wallet => wallet.id === parseInt(params.id));

    if (typeof result === 'undefined' || result === null) throw new CustomError(404, 'Wallet not found');

    return res.status(200).json({ result });
  } catch (err: any) {
    return res.status(err.errorCode || 500).json({ error: err.message });
  }
});

router.get('/transactions/:id', async (req, res) => {
  try {
    const { params } = pick(['params'], req);
    const allWallets = await db.models.wallet.findWallets();
    const allWalletsJson = map(wallet => wallet.toJSON(), allWallets);
    const wallet = find(wallet => wallet.id === parseInt(params.id), allWalletsJson);

    if (typeof wallet === 'undefined' || wallet === null) throw new CustomError(404, 'Wallet not found');

    let result: any = await redis.getVal(toLower(wallet.address));
    let transactions: any[] = [];

    Object.keys(result).forEach(key => {
      const obj = JSON.parse(result[key]);
      transactions = [...transactions, obj];
    });

    result = transactions;
    result = await mapRedisResponsesToIdealTxs(result);
    return res.status(200).json({ result });
  } catch (err: any) {
    return res.status(err.errorCode || 500).json({ error: err.message });
  }
});

router.get('/locked_transactions/:id', async (req, res) => {
  try {
    const { params } = pick(['params'], req);
    const allTx = await db.models.lockedTransaction.getAllTransactions();
    const allTxJson = map(tx => tx.toJSON(), allTx);
    const result = filter(tx => tx.walletId === parseInt(params.id), allTxJson);
    return res.status(200).json({ result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router
  .route('/push')
  .post(async (req, res) => {
    try {
      const { body } = pick(['body'], req);
      const allSubscriptions = await db.models.subscription.getSubscriptions();
      const allSubscriptionsJson = map(sub => sub.toJSON(), allSubscriptions);
      const exactSub = allSubscriptionsJson.find(sub => sub.walletId === body.walletId);

      if (typeof exactSub !== 'undefined') {
        await db.models.subscription.updateSubscription(
          { deviceId: body.deviceId },
          { where: { walletId: body.walletId } }
        );
        return res.status(200).json({ result: exactSub });
      }

      let result = await db.models.subscription.addSubscription({ deviceId: body.deviceId, walletId: body.walletId });
      result = result.toJSON();

      return res.status(201).json({ result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  })
  .delete(async (req, res) => {
    try {
      const { walletId } = req.body;
      await db.models.subscription.deleteSubscription({ where: { walletId } });

      return res.status(200).json({ result: 'DONE!' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

router.get('/prices', async (req, res) => {
  try {
    const result = await _redis.getVal(redisPriceKey);

    Object.keys(result).forEach(key => {
      result[key] = JSON.parse(result[key]);
    });

    return res.status(200).json({ result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, DELETE, GET');
  next();
});
app.use('/', router);

app.listen(port, () => {
  log('Server listening on %d', port);
  db.sequelize.sync({}).then(() => {
    log('Sequelize connected to DB');
    _redis._initConnection().then(() => {
      watchEvents();
      fetchTokenPrices().then(() => {
        watchPriceChangeHourly();
      });
    });
  });
});

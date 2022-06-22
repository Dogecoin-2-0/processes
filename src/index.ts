import express from 'express';
import { getAddress } from '@ethersproject/address';
import { forEach, find, map, pick, filter } from 'ramda';
import * as db from './db';
import CustomError from './custom/error';
import _redis from './helpers/redis';
import chainlist from './chainlist.json';
import { buildProvider } from './utils/provider';
import { propagateBlockData, syncFromLastProcessedBlock } from './handlers';
import log from './log';

const app: express.Express = express();
const router = express.Router();
const port = parseInt(process.env.PORT || '3600');

function watchBlocks() {
  forEach(chain => {
    const provider = buildProvider(chain.rpcUrl, chain.id);
    syncFromLastProcessedBlock(chain.id);

    provider.on('block', (blockNumber: number) => propagateBlockData(blockNumber, chain.id)());
  }, chainlist);
}

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

    if (typeof result === 'undefined') throw new CustomError(404, 'Wallet not found');

    return res.status(200).json({ result });
  } catch (err: any) {
    return res.status(err.errorCode || 500).json({ error: err.message });
  }
});

router.get('/transactions/:id', async (req, res) => {
  try {
    const { params } = pick(['params'], req);
    const allTx = await db.models.transaction.getAllTransactions();
    const allTxJson = map(tx => tx.toJSON(), allTx);
    const result = filter(tx => tx.walletId === parseInt(params.id), allTxJson);
    return res.status(200).json({ result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
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

app.listen(port, () => {
  log('Server listening on %d', port);
  db.sequelize.sync({}).then(() => {
    log('Sequelize connected to DB');
    _redis._initConnection().then(() => {
      watchBlocks();
    });
  });
});

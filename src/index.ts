import express from 'express';
import { forEach } from 'ramda';
import * as db from './db';
import CustomError from './custom/error';
import _redis from './helpers/redis';
import chainlist from './chainlist.json';
import { buildProvider } from './utils/provider';
import { propagateBlockData, syncFromLastProcessedBlock } from './handlers';
import log from './log';

const app = express();
const router = express.Router();
const port = parseInt(process.env.PORT || '18000');

function watchBlocks() {
  forEach(chain => {
    const provider = buildProvider(chain.rpcUrl, chain.id);
    syncFromLastProcessedBlock(chain.id);

    provider.on('block', (blockNumber: number) => propagateBlockData(blockNumber, chain.id)());
  }, chainlist);
}

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, DELETE');
  next();
});
app.use('/', router);

app.listen(port, () => {
  db.sequelize.sync({}).then(() => {
    log('Sequelize connected to DB');
    _redis._initConnection().then(() => {
      watchBlocks();
    });
  });
});

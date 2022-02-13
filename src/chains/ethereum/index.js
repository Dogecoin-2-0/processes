const Web3 = require('web3');
const redis = require('../../helpers/redis');
const db = require('../../db');
const { CHAIN_ENV } = require('../../env');
const erc20Abi = require('../../assets/ERC20ABI.json');
const log = require('../../log');

const providers = {
  mainnet: 'wss://eth-mainnet.alchemyapi.io/v2/P_KxmSHH9OHOmenGLnAF4HPSVnRNc9cW',
  testnet: 'wss://eth-ropsten.alchemyapi.io/v2/6u94O6TXVZnIC7N9xzfhR-HFch2p9ycX'
};

class EthProcesses {
  constructor(config = { latency: 10 }) {
    const provider = new Web3.providers.WebsocketProvider(
      providers[CHAIN_ENV] || 'wss://eth-ropsten.alchemyapi.io/v2/6u94O6TXVZnIC7N9xzfhR-HFch2p9ycX',
      {
        clientConfig: {
          maxReceivedFrameSize: 100000000,
          maxReceivedMessageSize: 100000000,
          keepalive: true,
          keepaliveInterval: 1600000
        },
        reconnect: {
          auto: true,
          delay: 5000,
          maxAttempts: 5,
          onTimeout: false
        }
      }
    );
    this.web3 = new Web3(provider);
    this.config = config;
    this.processed_block_key = 'eth_last_processed_block';
    this._chain = 'ethereum';
    this.lastProcessBlock = this.lastProcessBlock.bind(this);
    this.getBlockTransaction = this.getBlockTransaction.bind(this);
    this.getTransactionDetail = this.getTransactionDetail.bind(this);
    this.processBlocks = this.processBlocks.bind(this);
  }

  async lastProcessBlock(block) {
    const newBlock = block + 1;
    const _val = await redis.simpleSet(this.processed_block_key, newBlock);
    log('Block processed: %d, Redis response: %s', block, _val);
  }

  async getBlockTransaction(block_id) {
    const blockInfo = await this.web3.eth.getBlock(block_id);
    try {
      if (blockInfo.transactions) {
        for (const el of blockInfo.transactions) {
          setTimeout(() => {
            log('Now processing tx: %s', el);
          }, this.config.latency * 1000);
          this.getTransactionDetail(el, block_id);
        }
      }
    } catch (error) {
      log(`${this._chain}: %s`, error.message);
    }
  }

  async getTransactionDetail(transaction_id, block_id) {
    const txReceipt = await this.web3.eth.getTransactionReceipt(transaction_id);

    if (txReceipt !== null && typeof txReceipt.status !== 'undefined' && !txReceipt.status) {
      log(`${this._chain}: %s`, 'Tx receipt status failed');
      return;
    }

    try {
      const tx = await this.web3.eth.getTransaction(transaction_id.toString());
      let transactionDetail = {
        _chain: this._chain
      };

      if (!!txReceipt.status && txReceipt.logs.length > 0) {
        const logs = txReceipt.logs;
        for (const log of logs) {
          setTimeout(() => {
            console.log('Now processing log: %s', log.address);
          }, this.config.latency * 1000);
          const callValue = await this.web3.eth.call({
            to: log.address,
            data: this.web3.utils.sha3('decimals()')
          });
          const isERC20 = callValue !== '0x' || callValue !== '0x0';
          if (isERC20 && log.topics[1] !== undefined && log.topics[2] !== undefined) {
            console.log('Start processing contract: %s', log.address);
            const contract = new this.web3.eth.Contract(erc20Abi, log.address);
            const decimals = await contract.methods.decimals().call();
            transactionDetail = {
              ...transactionDetail,
              tx_id: log.transactionHash,
              from: tx.from,
              to: tx.to,
              block_id: log.blockNumber,
              amount: log.data / 10 ** decimals,
              is_erc_20: true,
              contract_address: log.address
            };
            const accountTo = await db.models.wallet.getWallet(transactionDetail.to);

            if (!!accountTo) {
              // Push transaction detail to Redis store
              const _val = await redis.setObjectVal(transactionDetail.to, transactionDetail.tx_id, transactionDetail);
              console.log('Redis response: %d', _val);
            }

            const accountFrom = await db.models.wallet.getWallet(transactionDetail.from);

            if (!!accountFrom) {
              // Push transaction detail to Redis store
              const _val = await redis.setObjectVal(transactionDetail.from, transactionDetail.tx_id, transactionDetail);
              console.log('Redis response: %d', _val);
            }
          }
        }
      } else {
        if (tx) {
          transactionDetail = {
            ...transactionDetail,
            tx_id: tx.hash,
            from: tx.from,
            to: tx.to,
            block_id,
            amount: this.web3.utils.fromWei(tx.value),
            is_erc_20: false
          };

          const accountTo = await db.models.wallet.getWallet(transactionDetail.to);

          if (!!accountTo) {
            // Push transaction to Redis store
            const _val = await redis.setObjectVal(transactionDetail.to, transactionDetail.tx_id, transactionDetail);
            log('Redis response: %d', _val);
          }

          const accountFrom = await db.models.wallet.getWallet(transactionDetail.from);

          if (!!accountFrom) {
            // Push transaction to Redis store
            const _val = await redis.setObjectVal(transactionDetail.from, transactionDetail.tx_id, transactionDetail);
            log('Redis response: %d', _val);
          }
        }
      }
      log('Transaction detail: %s', JSON.stringify(transactionDetail, undefined, 2));
    } catch (error) {
      log(`${this._chain}: %s`, error.message);
    }
  }

  processBlocks() {
    this.web3.eth
      .subscribe('newBlockHeaders', (error, event) => {
        if (!error) log('Now processing event: %d', event.number);
        else return;
      })
      .on('connected', subId => log('Event subscription ID: %s', subId))
      .on('data', block => {
        if (block.number) {
          setTimeout(() => {
            log('Now processing block: %d', block.number);
          }, this.config.latency * 1000);
          this.getBlockTransaction(block.number);
          this.lastProcessBlock(block.number);
        }
      })
      .on('error', error => log(`${this._chain}: %s`, error.message));
  }

  async sync() {
    const exists = await redis.exists(this.processed_block_key);

    if (exists) {
      const lastBlock = await redis.simpleGet(this.processed_block_key);
      setTimeout(() => {
        log('Now syncing from: %d', parseInt(lastBlock));
      }, this.config.latency * 1000);
      const logs = await this.web3.eth.getPastLogs({ fromBlock: parseInt(lastBlock) - 1 });

      for (const l of logs) {
        if (l.blockNumber) {
          setTimeout(() => {
            log('Now syncing: %d', l.blockNumber);
          }, this.config.latency * 1000);
          this.getBlockTransaction(l.blockNumber);
          this.lastProcessBlock(l.blockNumber);
        }
      }
    }
    log('Sync complete for: %s', this._chain);
  }
}

module.exports = new EthProcesses();

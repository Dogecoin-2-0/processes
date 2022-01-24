const Web3 = require('web3');
const redis = require('../../helpers/redis');
const db = require('../../db');
const erc20Abi = require('../../assets/ERC20ABI.json');

class EthProcesses {
  constructor(config = { min_block_confirmation: 3 }) {
    const provider = new Web3.providers.HttpProvider('https://ropsten.infura.io/v3/f9e72d0223644a4fa9a8807426b6dbef');
    this.web3 = new Web3(provider);
    this.config = config;
    this.processed_block_key = 'eth_last_processed_block';
    this.lastProcessBlock = this.lastProcessBlock.bind(this);
    this.getBlockTransaction = this.getBlockTransaction.bind(this);
    this.getTransactionDetail = this.getTransactionDetail.bind(this);
    this.processBlocks = this.processBlocks.bind(this);
  }

  async lastProcessBlock(block) {
    const newBlock = block + 1;
    const _val = await redis.simpleSet(this.processed_block_key, newBlock);
    console.log('Block processed: %d, Redis response: %s', block, _val);
  }

  async getBlockTransaction(block_id) {
    const blockInfo = await this.web3.eth.getBlock(block_id);
    try {
      if (blockInfo.transactions) {
        for (const el of blockInfo.transactions) this.getTransactionDetail(el, block_id);
      }
    } catch (error) {
      console.log(error);
    }
  }

  async getTransactionDetail(transaction_id, block_id) {
    const txReceipt = await this.web3.eth.getTransactionReceipt(transaction_id);

    if (txReceipt !== null && typeof txReceipt.status !== 'undefined' && !txReceipt.status) {
      console.log('Tx receipt status failed');
      return;
    }

    try {
      const tx = await this.web3.eth.getTransaction(transaction_id.toString());
      let transactionDetail = {
        _chain: 'ethereum'
      };

      if (!!txReceipt.status && txReceipt.logs.length > 0) {
        const logs = txReceipt.logs;
        for (const log of logs) {
          const callValue = await this.web3.eth.call({
            to: log.address,
            data: this.web3.utils.sha3('decimals()')
          });
          const isERC20 = callValue !== '0x' || callValue !== '0x0';
          if (isERC20 && log.topics[1] !== undefined && log.topics[2] !== undefined) {
            console.log('Start processing contract: ', log.address);
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
              console.log('Redis addition: ', _val);
            }

            const accountFrom = await db.models.wallet.getWallet(transactionDetail.from);

            if (!!accountFrom) {
              // Push transaction detail to Redis store
              const _val = await redis.setObjectVal(transactionDetail.from, transactionDetail.tx_id, transactionDetail);
              console.log('Redis addition: ', _val);
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
            console.log('Redis addition: ', _val);
          }

          const accountFrom = await db.models.wallet.getWallet(transactionDetail.from);

          if (!!accountFrom) {
            // Push transaction to Redis store
            const _val = await redis.setObjectVal(transactionDetail.from, transactionDetail.tx_id, transactionDetail);
            console.log('Redis addition: ', transactionDetail);
          }
        }
      }
      console.log('Transaction detail: ', JSON.stringify(transactionDetail, undefined, 2));
    } catch (error) {
      console.log(error);
    }
  }

  async processBlocks() {
    const currentBlock = await this.web3.eth.getBlockNumber();
    const _exists = await redis.exists(this.processed_block_key);

    if (!_exists) {
      const _val = await redis.simpleSet(this.processed_block_key, currentBlock);
      console.log('Redis response: ', _val);
    }

    let _block_to_start_from = await redis.simpleGet(this.processed_block_key);
    _block_to_start_from = parseInt(_block_to_start_from);
    const lastBlockToProcess = currentBlock - this.config.min_block_confirmation;

    if (_block_to_start_from <= lastBlockToProcess) {
      await this.lastProcessBlock(_block_to_start_from);
      await this.getBlockTransaction(_block_to_start_from);
    }
  }
}

module.exports = new EthProcesses();

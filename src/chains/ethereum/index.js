import Web3 from 'web3';
const store = require('../../helpers/localStore');

class EthProcesses {
  constructor(config = { min_block_confirmation: 3 }) {
    this.web3 = new Web3();
    this.config = config;
  }

  lastProcessBlock(block) {
    const newBlock = block + 1;
    store._addToStore('eth_last_processed_block', newBlock);
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
      let transactionDetail = {};

      if (!!txReceipt.status && txReceipt.logs.length > 0) {
        const logs = txReceipt.logs;
        for (const log of logs) {
          const callValue = await this.web3.eth.call({ to: log.address, data: this.web3.utils.sha3('decimals()') });
          const isERC20 = callValue !== '0x' || callValue !== '0x0';
          if (isERC20 && log.topics[1] !== undefined && log.topics[2] !== undefined) {
            const contract = new this.web3.eth.Contract(null, log.address);
            const decimals = await contract.methods.decimals().call();
            transactionDetail = {
              ...transactionDetail,
              tx_id: log.transactionHash,
              from: tx.from,
              to: tx.to,
              block_id: log.blockNumber,
              amount: log.data / decimals,
              is_erc_20: true
            };
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  async processBlock() {
    const currentBlock = await this.web3.eth.getBlockNumber();
    const _block_to_start_from = store._getFromStore('eth_last_processed_block');
    const lastBlockToProcess = currentBlock - this.config.min_block_confirmation;

    if (_block_to_start_from <= lastBlockToProcess) {
      this.lastProcessBlock(_block_to_start_from);
    }
  }
}

module.exports = EthProcesses;

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
        for (const el of blockInfo.transactions) console.log(el);
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

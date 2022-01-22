const store = require('../../helpers/localStore');

class EthProcesses {
  lastProcessBlock(block) {
    const newBlock = block + 1;
    store._addToStore('eth_last_processed_block', newBlock);
  }
}

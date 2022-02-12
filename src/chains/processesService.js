const eth = require('./ethereum');
const bsc = require('./smartchain');
const avax = require('./avalanche');
const matic = require('./polygon');

class ProcessesService {
  static async _initProcesses() {
    try {
      await Promise.all([eth.processBlocks(), bsc.processBlocks(), avax.processBlocks(), matic.processBlocks()]);
    } catch (error) {
      console.log(error);
    }
  }
}

module.exports = ProcessesService;

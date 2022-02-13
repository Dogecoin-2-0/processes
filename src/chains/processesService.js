const eth = require('./ethereum');
const bsc = require('./smartchain');
const avax = require('./avalanche');
const matic = require('./polygon');

class ProcessesService {
  static async _initProcesses() {
    try {
      await Promise.all([
        bsc.sync().then(() => {
          return bsc.processBlocks();
        }),
        eth.sync().then(() => {
          return eth.processBlocks();
        }),
        matic.sync().then(() => {
          return matic.processBlocks();
        }),
        avax.sync().then(() => {
          return avax.processBlocks();
        })
      ]);
    } catch (error) {
      console.log(error);
    }
  }
}

module.exports = ProcessesService;

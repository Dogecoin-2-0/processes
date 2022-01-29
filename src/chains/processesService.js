const eth = require('./ethereum');
const bsc = require('./smartchain');

class ProcessesService {
  static async _initProcesses() {
    try {
      await Promise.all([eth.processBlocks(), bsc.processBlocks()]);
    } catch (error) {
      console.log(error);
    }
  }
}

module.exports = ProcessesService;

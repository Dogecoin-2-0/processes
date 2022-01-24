const eth = require('./ethereum');

class ProcessesService {
  static async _initProcesses() {
    try {
      await eth.processBlocks();
    } catch (error) {
      console.log(error);
    }
  }
}

module.exports = ProcessesService;

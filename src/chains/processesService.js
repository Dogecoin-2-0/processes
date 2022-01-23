const eth = require('./ethereum');

class ProcessesService {
  static async _initProcesses() {
    try {
      await eth.processBlocks();
    } catch (error) {}
  }
}

const Web3 = require('web3');
const abi = require('./priceFeedABI.json');

class Feed {
  constructor(web3URL, contractAddress) {
    const web3 = new Web3(new Web3.providers.HttpProvider(web3URL));
    this.contract = new web3.eth.Contract(abi, contractAddress);
  }

  fetchPrice(baseAddress) {
    return Promise.resolve(this.contract.methods.fetchLatestPrice(baseAddress).call());
  }

  getDecimals(baseAddress) {
    return Promise.resolve(this.contract.methods.getDecimals(baseAddress).call());
  }
}

module.exports = Feed;

const Web3 = require('web3');

class Feed {
  constructor(web3URL, contractAddress) {
    const web3 = new Web3(new Web3.providers.HttpProvider(web3URL));
    this.contract = new web3.eth.Contract('', contractAddress);
  }

  fetchPrice(baseAddress) {
    return Promise.resolve(
      this.contract.methods.getPriceUSD(baseAddress).call()
    );
  }
}

module.exports = Feed;

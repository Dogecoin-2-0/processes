const Web3 = require('web3');

function chainlinkPrice(web3URL, proxyAddr) {
  try {
    const web3 = new Web3(new Web3.providers.HttpProvider(web3URL));
    const priceFeed = new web3.eth.Contract('', proxyAddr);
    return Promise.resolve(priceFeed.methods.latestRoundData().call());
  } catch (error) {
    throw new Error(error.message);
  }
}

module.exports.chainlinkPrice = chainlinkPrice;

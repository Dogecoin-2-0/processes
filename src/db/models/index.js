const Subscription = require('./subscription');
const Transaction = require('./transaction');
const Wallet = require('./wallet');

module.exports.subscription = new Subscription();
module.exports.tx = new Transaction();
module.exports.wallet = new Wallet();

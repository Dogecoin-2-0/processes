const { Schema, model } = require('mongoose');

const TransactionSchema = new Schema({
  tx_id: { type: String, required: true, unique: true },
  blockchain: { type: String, required: true }
});

class Transaction {
  constructor() {
    this.model = model('Transaction', TransactionSchema);
  }

  addTx(tx_id, blockchain) {
    return Promise.resolve(this.model.create({ tx_id, blockchain }));
  }

  findAllTx() {
    return Promise.resolve(this.model.find());
  }

  deleteTx(tx_id) {
    return Promise.resolve(this.model.findOneAndDelete({ tx_id }));
  }
}

module.exports = Transaction;

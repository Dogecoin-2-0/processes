const { Schema, model } = require('mongoose');

const WalletSchema = new Schema({
  address: {
    type: String,
    required: true
  }
});

class Wallet {
  constructor() {
    this.model = model('Wallet', WalletSchema);
  }

  addWallet(address) {
    return Promise.resolve(this.model.create({ address }));
  }

  getWallet(address) {
    return Promise.resolve(
      this.model.findOne({
        address: { $regex: '^' + address + '$', $options: 'i' }
      })
    );
  }
}

module.exports = Wallet;

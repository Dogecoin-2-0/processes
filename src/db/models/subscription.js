const { Schema, model } = require('mongoose');

const SubscriptionSchema = new Schema({
  address: { type: String, required: true, unique: true },
  token: { type: String, require: true }
});

class Subscription {
  constructor() {
    this.model = model('Subscription', SubscriptionSchema);
  }

  createSubscription(body) {
    return Promise.resolve(this.model.create({ ...body }));
  }

  getSubscription(address) {
    return Promise.resolve(
      this.model.findOne({
        address: { $regex: '^' + address + '$', $options: 'i' }
      })
    );
  }

  updateSubscription(address, token) {
    return Promise.resolve(
      this.model.findOneAndUpdate({ address: { $regex: '^' + address + '$', $options: 'i' } }, { token }, { new: true })
    );
  }

  deleteSubscription(address) {
    return Promise.resolve(
      this.model.findOneAndDelete({
        address: { $regex: '^' + address + '$', $options: 'i' }
      })
    );
  }
}

module.exports = Subscription;

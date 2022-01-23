const { createClient } = require('redis');

class RedisStore {
  constructor() {
    this.client = createClient();
  }

  async _initConnection() {
    this.client.on('error', console.log);
    await this.client.connect();
  }

  setVal(key, field, value, expiresIn = 0) {
    return new Promise(async (resolve, reject) => {
      this.client
        .hSet(key, field, JSON.stringify(value))
        .then(_val => {
          if (expiresIn !== 0) await this.client.expire(key, expiresIn * 60);

          resolve(_val);
        })
        .catch(reject);
    });
  }

  getVal(key) {
    return this.client.hGetAll(key);
  }
}

module.exports = new RedisStore();

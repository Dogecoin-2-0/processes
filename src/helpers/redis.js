const { createClient } = require('redis');

class RedisStore {
  constructor() {
    this.client = createClient();
    // this._initConnection = this._initConnection.bind(this);
    // this.exists = this.exists.bind(this);
    // this.getVal = this.getVal.bind(this);
    // this.setObjectVal = this.setObjectVal.bind(this);
    // this.simpleGet = this.simpleGet.bind(this);
    // this.simpleSet = this.simpleSet.bind(this);
  }

  async _initConnection() {
    this.client.on('error', console.log);
    await this.client.connect();
  }

  /**
   *
   * @param {string} key
   * @param {string} field
   * @param {any} value
   * @param {number} expiresIn
   * @returns {Promise<number>}
   */
  setObjectVal(key, field, value, expiresIn = 0) {
    return new Promise((resolve, reject) => {
      this.client
        .hSet(key, field, JSON.stringify(value))
        .then(async _val => {
          if (expiresIn > 0) await this.client.expire(key, expiresIn * 60);

          resolve(_val);
        })
        .catch(reject);
    });
  }

  /**
   *
   * @param {string} key
   * @param {string | number} value
   * @param {number} expiresIn
   * @returns {Promise<string>}
   */
  simpleSet(key, value, expiresIn = 0) {
    return new Promise((resolve, reject) => {
      this.client
        .set(key, typeof value === 'number' ? value.toString() : value)
        .then(async _val => {
          if (expiresIn > 0) await this.client.expire(key, expiresIn * 60);

          resolve(_val);
        })
        .catch(reject);
    });
  }

  /**
   *
   * @param {string} key
   * @returns {Promise<{ [x:string]: string }>}
   */
  getVal(key) {
    return this.client.hGetAll(key);
  }

  /**
   *
   * @param {string} key
   * @returns {Promise<string>}
   */
  simpleGet(key) {
    return this.client.get(key);
  }

  /**
   *
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  exists(key) {
    return new Promise((resolve, reject) => {
      this.client
        .exists(key)
        .then(_val => {
          if (_val === 1) resolve(true);
          else resolve(false);
        })
        .catch(reject);
    });
  }
}

module.exports = new RedisStore();

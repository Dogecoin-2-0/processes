const fs = require('fs');
const path = require('path');

class LocalStore {
  constructor() {
    this._init();
  }

  _init() {
    const p = '../store.json';
    const exists = fs.existsSync(path.join(__dirname, p));

    if (!exists) fs.writeFileSync(path.join(__dirname, p), JSON.stringify({}));
  }

  _getStore() {
    return fs.readFileSync(path.join(__dirname, '../store.json'));
  }

  _addToStore(key, val) {
    const _store = this._getStore();
    let _storeJson = JSON.parse(_store.toString());
    _storeJson = { ..._storeJson, [key]: val };
    fs.writeFileSync(
      path.join(__dirname, '../store.json'),
      JSON.stringify(_storeJson)
    );
  }

  _getFromStore(key) {
    const _store = this._getStore();
    const _storeJson = JSON.parse(_store.toString());
    return _storeJson[key];
  }
}

module.exports = new LocalStore();

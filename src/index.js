const express = require('express');
const app = express();
const Feed = require('./chains/priceFeed');

const server = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const priceRecord = {};

function emitPriceAtIntervals(ids) {
  const constants = { INCREASE: 'INCREASE', DECREASE: 'DECREASE' };
  const feed = new Feed('', '');
  setInterval(async () => {
    let _record = {};
    for (const id of ids) {
      let price = await feed.fetchPrice(id);
      price = price / 10 ** 8;
      let _type = constants.INCREASE;
      let _percentage = 0;
      if (!!priceRecord[id]) {
        _percentage =
          priceRecord[id] > price
            ? ((priceRecord[id] - price) * 100) / priceRecord[id]
            : ((price - priceRecord[id]) * 100) / price;
      }
      _type = price > priceRecord[id] ? constants.INCREASE : constants.DECREASE;
      _record = { ..._record, [id]: { _type, _percentage, price } };
      priceRecord[id] = price;
    }
    io.emit('price', { ..._record });
  });
}

io.on('connection', (socket) => {
  socket.on;
});

const express = require('express');
const app = express();
const Feed = require('./chains/priceFeed');

const server = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const ethPriceRecord = {};

function emitPriceAtIntervalsForETH(ids) {
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
          ethPriceRecord[id] > price
            ? ((ethPriceRecord[id] - price) * 100) / ethPriceRecord[id]
            : ((price - ethPriceRecord[id]) * 100) / price;
      } else {
        ethPriceRecord[id] = price;
      }
      _type =
        price > ethPriceRecord[id] ? constants.INCREASE : constants.DECREASE;
      _record = { ..._record, [id]: { _type, _percentage, price } };
      ethPriceRecord[id] = price;
    }
    io.emit('eth_price', { ..._record });
  });
}

io.on('connection', (socket) => {
  emitPriceAtIntervalsForETH(['0x']);
});

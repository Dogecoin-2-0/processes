const { Server } = require('http');
const { Server: SocketServer } = require('socket.io');

class SocketService {
  /**
   *
   * @param {Server} server
   */
  static _init(server) {
    this.socketIds = [];
    this.io = new SocketServer(server);
    this.io.on('connection', socket => {
      this.socketIds = [...this.socketIds, socket.id];
    });
    this.io.on('disconnect', socket => {
      this.socketIds = this.socketIds.filter(id => id !== socket.id);
    });
  }

  /**
   *
   * @param {string} event
   * @param {any} val
   */
  static _emitToAll(event, val) {
    for (const id of this.socketIds) this.io.to(id).emit(event, typeof val === 'string' ? val : JSON.stringify(val));
  }
}

module.exports = SocketService;

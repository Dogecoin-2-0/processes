const { Server } = require('http');
const { Server: SocketServer } = require('socket.io');

class SocketService {
  /**
   * @type {Array<string>}
   */
  static socketIds = [];

  /**
   * @type {SocketServer}
   */
  static io;

  /**
   *
   * @param {Server} server
   */
  static _init(server) {
    this.io = new SocketServer(server, { cors: { origin: '*' } });
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
    for (const id of SocketService.socketIds)
      SocketService.io.to(id).emit(event, typeof val === 'string' ? val : JSON.stringify(val));
  }
}

module.exports = SocketService;

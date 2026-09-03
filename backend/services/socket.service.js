const { Server } = require('socket.io');
const logger     = require('../config/logger');

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    logger.info(`[socket] client connected: ${socket.id}`);

    socket.on('subscribe:service', (serviceId) => {
      socket.join(`service:${serviceId}`);
      logger.info(`[socket] ${socket.id} subscribed to service:${serviceId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return io;
};

const emitEvent = (event, payload) => {
  if (!io) return;
  io.emit(event, { ...payload, timestamp: new Date() });
};

const emitToService = (serviceId, event, payload) => {
  if (!io) return;
  io.to(`service:${serviceId}`).emit(event, { ...payload, timestamp: new Date() });
};

module.exports = { initSocket, emitEvent, emitToService };

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createPubSubClient } from '../config/redisConfig.js';
import { authenticateSocket, canJoinBookingRoom } from './socketAuth.js';
import serverConfig from '../config/serverConfig.js';
import logger from '../utils/logger.js';

let io = null;
let adapterPubClient = null;
let adapterSubClient = null;

/**
 * Initialize Socket.IO with the Redis Adapter per PATHCARE_CONTEXT.md §6.3
 * Configure Day One even on a single instance to guarantee horizontal scaling.
 */
export function initializeSocket(httpServer, options = {}) {
  io = new Server(httpServer, {
    cors: {
      /**
       * The parsed list, not the raw environment string.
       *
       * `process.env.CORS_ORIGIN` is a comma-separated value. Handed over
       * whole it works by accident with one origin and breaks silently with
       * two: the handshake answers
       * `Access-Control-Allow-Origin: https://a,https://b`, which no browser
       * accepts. The REST API kept working — it parses the same variable in
       * serverConfig — so the symptom was live tracking going dead on a
       * deployment where every other call was fine.
       */
      origin: serverConfig.corsOrigin,
      methods: ['GET', 'POST', 'PATCH'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    ...options.serverOptions,
  });

  // Attach Redis adapter
  if (options.pubClient && options.subClient) {
    adapterPubClient = options.pubClient;
    adapterSubClient = options.subClient;
    io.adapter(createAdapter(options.pubClient, options.subClient));
    logger.info('Socket.IO initialized with custom Redis adapter');
  } else {
    try {
      adapterPubClient = createPubSubClient({ lazyConnect: true });
      adapterSubClient = adapterPubClient.duplicate();

      Promise.all([adapterPubClient.connect(), adapterSubClient.connect()])
        .then(() => {
          io.adapter(createAdapter(adapterPubClient, adapterSubClient));
          logger.info('Socket.IO Redis adapter initialized successfully');
        })
        .catch((err) => {
          logger.warn('Socket.IO running without Redis adapter (fallback)', {
            error: err.message,
          });
        });
    } catch (error) {
      logger.warn('Socket.IO running without Redis adapter', { error: error.message });
    }
  }

  // Reject any connection without a valid access token (CONTEXT §3.2).
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    logger.info('Socket client connected', {
      socketId: socket.id,
      role: socket.data.user?.role,
    });

    // Room per booking: booking:<id>
    socket.on('join_booking', async (data) => {
      const bookingId = (data?.bookingId || data)?.toString();
      if (!bookingId) {
        return;
      }

      // Subscribing to a booking room streams that patient's diagnostic
      // progress and their phlebotomist's live GPS. Verify entitlement first.
      const allowed = await canJoinBookingRoom({
        bookingId,
        user: socket.data.user,
      });

      if (!allowed) {
        logger.warn('Socket denied join to booking room', {
          socketId: socket.id,
          bookingId,
          role: socket.data.user?.role,
        });
        // Deliberately does not distinguish "no such booking" from "not yours".
        socket.emit('join_booking_denied', { bookingId });
        return;
      }

      const room = `booking:${bookingId}`;
      socket.join(room);
      logger.debug('Socket joined booking room', { socketId: socket.id, room });
      socket.emit('joined_booking', { bookingId, room });
    });

    socket.on('leave_booking', (data) => {
      const bookingId = (data?.bookingId || data)?.toString();
      if (bookingId) {
        const room = `booking:${bookingId}`;
        socket.leave(room);
        logger.debug('Socket left booking room', { socketId: socket.id, room });
        socket.emit('left_booking', { bookingId, room });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket client disconnected', { socketId: socket.id, reason });
    });
  });

  return io;
}

/**
 * Retrieve active Socket.IO server instance
 */
export function getIO() {
  return io;
}

/**
 * Emit BOOKING_STATUS_UPDATED into that booking's room only
 */
export function emitBookingStatusUpdate(bookingId, payload) {
  if (!io) {
    logger.debug('Socket.IO not initialized, skipping status update emit');
    return false;
  }

  const bId = bookingId.toString();
  const room = `booking:${bId}`;
  const message = {
    bookingId: bId,
    ...payload,
    timestamp: payload.timestamp || new Date().toISOString(),
  };

  io.to(room).emit('BOOKING_STATUS_UPDATED', message);
  logger.info('Emitted BOOKING_STATUS_UPDATED to room', { room, status: payload.status });
  return true;
}

/**
 * Emit RIDER_LOCATION on each rider ping into that booking's room only
 */
export function emitRiderLocation(bookingId, payload) {
  if (!io) {
    logger.debug('Socket.IO not initialized, skipping rider location emit');
    return false;
  }

  const bId = bookingId.toString();
  const room = `booking:${bId}`;
  const message = {
    bookingId: bId,
    ...payload,
    timestamp: payload.timestamp || new Date().toISOString(),
  };

  io.to(room).emit('RIDER_LOCATION', message);
  logger.debug('Emitted RIDER_LOCATION to room', { room, riderId: payload.riderId });
  return true;
}

/**
 * Cleanly close socket server (useful in tests & graceful shutdown)
 */
export async function closeSocket() {
  if (io) {
    await new Promise((resolve) => io.close(resolve));
    io = null;
  }
  if (adapterPubClient) {
    try {
      await adapterPubClient.quit();
    } catch {
      // ignore
    }
    adapterPubClient = null;
  }
  if (adapterSubClient) {
    try {
      await adapterSubClient.quit();
    } catch {
      // ignore
    }
    adapterSubClient = null;
  }
}

export default {
  initializeSocket,
  getIO,
  emitBookingStatusUpdate,
  emitRiderLocation,
  closeSocket,
};

// frontend/src/utils/socketClient.js
import { io } from 'socket.io-client';

let socket = null;
let currentToken = null;

/**
 * The server rejects unauthenticated connections, so an access token must be
 * supplied. If the token changes (login, refresh), the existing socket is torn
 * down and reconnected with the new credential.
 */
export function getSocket(accessToken = null, serverUrl = window.location.origin) {
  if (socket && accessToken && accessToken !== currentToken) {
    disconnectSocket();
  }

  if (!socket) {
    // `process` does not exist in a browser bundle; Vite exposes env via
    // import.meta.env. This threw a ReferenceError the moment getSocket() ran.
    const url = import.meta.env?.VITE_WS_URL || serverUrl;
    currentToken = accessToken;
    socket = io(url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: { token: accessToken },
    });
  }
  return socket;
}

export function joinBookingRoom(bookingId) {
  const s = getSocket();
  if (s && bookingId) {
    s.emit('join_booking', { bookingId: bookingId.toString() });
  }
}

export function leaveBookingRoom(bookingId) {
  const s = getSocket();
  if (s && bookingId) {
    s.emit('leave_booking', { bookingId: bookingId.toString() });
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}

export default {
  getSocket,
  joinBookingRoom,
  leaveBookingRoom,
  disconnectSocket,
};

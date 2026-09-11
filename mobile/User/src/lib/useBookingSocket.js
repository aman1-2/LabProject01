import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config/env.js';
import { getAccessToken } from '../auth/secureTokens.js';

/**
 * Live updates for ONE booking.
 *
 * The socket is authenticated with the access token and joins only this
 * booking's room; the server verifies ownership before admitting the join, so a
 * patient cannot subscribe to someone else's rider position (CONTEXT §3.2).
 *
 * CONTEXT §6.3: "on socket reconnect, the client fetches current status once
 * over REST. Redis pub/sub has no replay." Anything that happened while the
 * socket was down is invisible to it, so every (re)connect fires
 * `onStatusChange` to make the caller re-read authoritative state.
 */
export function useBookingSocket(bookingId, { onStatusChange } = {}) {
  const [riderPosition, setRiderPosition] = useState(null);
  const [connected, setConnected] = useState(false);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    if (!bookingId) {
      setRiderPosition(null);
      return undefined;
    }

    let socket;
    let cancelled = false;

    (async () => {
      const token = await getAccessToken();
      if (cancelled || !token) return;

      socket = io(API_BASE_URL, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
      });

      socket.on('connect', () => {
        setConnected(true);
        socket.emit('join_booking', { bookingId });
        // The REST resync — not optional. See §6.3 above.
        onStatusChangeRef.current?.();
      });

      socket.on('disconnect', () => setConnected(false));

      socket.on('RIDER_LOCATION', (message) => {
        if (String(message?.bookingId) !== String(bookingId)) return;
        if (typeof message.lat !== 'number' || typeof message.lng !== 'number') return;
        setRiderPosition({ lat: message.lat, lng: message.lng, at: Date.now() });
      });

      socket.on('BOOKING_STATUS_UPDATED', (message) => {
        if (String(message?.bookingId) !== String(bookingId)) return;
        // The socket says something changed; the server says what it is.
        onStatusChangeRef.current?.();
      });

      socket.on('join_booking_denied', () => {
        // Not ours, or no longer ours. Stop rather than retrying into a wall.
        socket.disconnect();
        setConnected(false);
      });
    })();

    // Coming back from the background is a reconnect in all but name, and the
    // same no-replay problem applies.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') onStatusChangeRef.current?.();
    });

    return () => {
      cancelled = true;
      appStateSub?.remove?.();
      if (socket) {
        socket.emit('leave_booking', { bookingId });
        socket.disconnect();
      }
      setConnected(false);
      setRiderPosition(null);
    };
  }, [bookingId]);

  return { riderPosition, connected };
}

export default useBookingSocket;

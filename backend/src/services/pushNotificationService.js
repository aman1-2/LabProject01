// backend/src/services/pushNotificationService.js
import { User } from '../schemas/User.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Expo's push endpoint. Expo push tokens are delivered through Expo's service,
 * which authenticates the TOKEN rather than the sender, so no server secret is
 * required here — nothing needs fabricating (CONTEXT §11). A standalone Android
 * build still needs FCM credentials configured in the Expo project itself, but
 * that is a build-time concern, not a runtime secret this process holds.
 */
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo tokens look like ExponentPushToken[xxxxxxxx] or ExpoPushToken[...]. */
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function isValidExpoPushToken(token) {
  return typeof token === 'string' && EXPO_TOKEN_PATTERN.test(token.trim());
}

/**
 * Register (or clear) the calling user's device token.
 * Scoped to the authenticated user — a caller can only ever write their own.
 */
export async function registerPushToken({ userId, expoPushToken }) {
  if (expoPushToken === null || expoPushToken === '') {
    await User.updateOne({ _id: userId }, { $set: { expoPushToken: null } });
    return { registered: false };
  }

  if (!isValidExpoPushToken(expoPushToken)) {
    throw new AppError(
      'That does not look like a valid Expo push token',
      400,
      'INVALID_PUSH_TOKEN'
    );
  }

  await User.updateOne(
    { _id: userId },
    { $set: { expoPushToken: expoPushToken.trim() } }
  );

  return { registered: true };
}

/**
 * Deliver one notification. Called from the queue processor, never inline in a
 * request handler (CONTEXT §10: "await on WhatsApp/SMS inside a request handler
 * → Enqueue it").
 *
 * Fails soft: a push that cannot be delivered must never fail the booking or
 * dispatch that triggered it.
 */
export async function sendPushToUser({ userId, title, body, data = {} }) {
  if (!isFeatureEnabled('PUSH_NOTIFICATIONS')) {
    logger.debug('Push notifications disabled by feature flag; skipping', { userId });
    return { sent: false, reason: 'feature_disabled' };
  }

  const user = await User.findById(userId).select('expoPushToken');
  const token = user?.expoPushToken;

  if (!token || !isValidExpoPushToken(token)) {
    return { sent: false, reason: 'no_registered_device' };
  }

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ to: token, title, body, data, sound: 'default', priority: 'high' }]),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn('Expo push delivery returned non-2xx', { status: response.status, body: text });
      return { sent: false, reason: 'push_service_error' };
    }

    const payload = await response.json();
    const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;

    // A DeviceNotRegistered ticket means the app was uninstalled or the token
    // rotated. Clear it so we stop trying.
    if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
      await User.updateOne({ _id: userId }, { $set: { expoPushToken: null } });
      return { sent: false, reason: 'device_not_registered' };
    }

    return { sent: ticket?.status === 'ok', ticket };
  } catch (err) {
    logger.warn('Push delivery failed', { error: err.message });
    return { sent: false, reason: 'transport_error' };
  }
}

export const pushNotificationService = {
  registerPushToken,
  sendPushToUser,
  isValidExpoPushToken,
};

export default pushNotificationService;

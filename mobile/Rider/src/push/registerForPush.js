import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { registerPushToken } from '@pathcare/api';
import { colors } from '@pathcare/design-tokens';
import { EAS_PROJECT_ID } from '../config/env.js';
import { isExpoGo } from './isExpoGo.js';

/**
 * Loaded lazily and never in Expo Go.
 *
 * expo-notifications registers a push-token listener when the module is
 * evaluated, and since SDK 53 that throws inside Expo Go — taking the app down
 * with "[runtime not ready]" before the first screen renders. A static import
 * is therefore enough to break the app, whether or not any API is called.
 */
function loadNotifications() {
  if (isExpoGo) return null;
  return require('expo-notifications');
}


/**
 * Push registration for job assignment.
 *
 * A dispatcher can assign a job to a phlebotomist who does not have the app
 * open; without this, they find out whenever they next happen to look, and the
 * patient waits.
 */
const NotificationsAtStartup = loadNotifications();

if (NotificationsAtStartup) {
  NotificationsAtStartup.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Returns { registered, reason }. Never throws: a rider who declined
 * notifications, or an emulator with no push support, must still be able to
 * work — the Jobs list polls regardless.
 */
export async function registerForPushNotifications() {
  const Notifications = loadNotifications();
  if (!Notifications) return { registered: false, reason: 'expo_go' };

  try {
    if (!Device.isDevice) {
      // Simulators are not issued push tokens.
      return { registered: false, reason: 'not_a_physical_device' };
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('jobs', {
        name: 'Job assignments',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.blue600,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      return { registered: false, reason: 'permission_denied' };
    }

    // A standalone build needs the EAS project id to be issued a token. Not
    // fabricating one: without it we report the gap rather than registering a
    // token that will never receive anything (CONTEXT §11).
    if (!EAS_PROJECT_ID) {
      return { registered: false, reason: 'missing_eas_project_id' };
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    if (!token?.data) {
      return { registered: false, reason: 'no_token_issued' };
    }

    await registerPushToken(token.data);
    return { registered: true, token: token.data };
  } catch (error) {
    return { registered: false, reason: 'error', message: error?.message };
  }
}

/** Called on sign-out so an assignment is never pushed to a signed-out device. */
export async function unregisterPushNotifications() {
  const Notifications = loadNotifications();
  if (!Notifications) return { registered: false, reason: 'expo_go' };

  try {
    await registerPushToken(null);
  } catch {
    /* best effort — the session is ending either way */
  }
}

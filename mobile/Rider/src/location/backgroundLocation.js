import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { updateRiderLocation } from '@pathcare/api';
import { colors } from '@pathcare/design-tokens';
import { LOCATION_INTERVAL_MS, LOCATION_DISTANCE_FILTER_M } from '../config/env.js';

/**
 * Background location, active only while a job is in hand.
 *
 * The patient watching the track screen needs to see the phlebotomist
 * approaching, and the phone is in a pocket or on a mount with the app in the
 * background for most of that. This is the only reason background location is
 * requested, and it stops the moment the job ends — a courier app that tracks a
 * rider between shifts is surveillance, not a feature.
 *
 * The server keeps rider positions in Redis only, never in Mongo, and throttles
 * to one update per 10s (CONTEXT §6.3). The client interval sits above that so
 * the server's 429 is a backstop rather than the normal response.
 */
export const LOCATION_TASK_NAME = 'pathcare-rider-location';

/**
 * A stale position is worse than none: it draws the rider's marker somewhere
 * they left ten minutes ago and the patient plans around it.
 */
const MAX_FIX_AGE_MS = 60000;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;

  // Only the newest fix. The OS batches these, and replaying the whole batch
  // would just burn the server's throttle window on positions already passed.
  const latest = data.locations[data.locations.length - 1];
  if (!latest?.coords) return;

  if (latest.timestamp && Date.now() - latest.timestamp > MAX_FIX_AGE_MS) return;

  try {
    await updateRiderLocation({ lat: latest.coords.latitude, lng: latest.coords.longitude });
  } catch {
    // A dropped ping is not worth retrying — the next one is seconds away, and
    // location updates are explicitly NOT queued for later replay.
  }
});

/**
 * Requests permission and starts tracking. Returns why it could not start, so
 * the UI can say something specific rather than failing silently.
 */
export async function startJobLocationTracking() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { started: false, reason: 'foreground_denied' };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    // Foreground-only still helps the patient while the rider has the app open.
    return { started: false, reason: 'background_denied' };
  }

  const alreadyRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (alreadyRunning) return { started: true, reason: 'already_running' };

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: LOCATION_INTERVAL_MS,
    distanceInterval: LOCATION_DISTANCE_FILTER_M,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'PathCare Rider — on a collection',
      notificationBody: 'Sharing your location with the patient until this job is complete.',
      notificationColor: colors.blue600,
    },
  });

  return { started: true };
}

export async function stopJobLocationTracking() {
  const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (!running) return { stopped: false };
  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  return { stopped: true };
}

export async function isTrackingActive() {
  return TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
}

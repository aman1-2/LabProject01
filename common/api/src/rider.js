import { apiClient } from './client.js';

/**
 * Phlebotomist (rider) endpoints — P05/P06.
 *
 * These wrap the routes that already exist under /api/rider. No endpoint here
 * is new: the rider app is a client of the platform, not an extension of it.
 */

export const riderKeys = {
  all: ['rider'],
  jobs: () => ['rider', 'jobs'],
};

/** Active job + unclaimed jobs at this rider's lab centre. */
export async function fetchRiderJobs(client = apiClient) {
  const response = await client.get('/api/rider/jobs');
  return response.data?.data;
}

/**
 * Claim a job. The server claims atomically and answers 409 JOB_ALREADY_TAKEN
 * when another phlebotomist got there first — that is an expected outcome in
 * normal operation, not an error condition, and the UI must say so plainly.
 */
export async function acceptJob(bookingId, client = apiClient) {
  const response = await client.patch(`/api/rider/jobs/${bookingId}/accept`);
  return response.data?.data;
}

/** 'available' | 'offline'. Refused while a job is assigned. */
export async function updateRiderStatus(status, client = apiClient) {
  const response = await client.patch('/api/rider/status', { status });
  return response.data?.data;
}

/**
 * Location ping. Server-side throttle is 1 per 10s and answers 429
 * LOCATION_UPDATE_THROTTLED; the caller throttles client-side too so the
 * rejection is the backstop rather than the norm.
 */
export async function updateRiderLocation({ lat, lng }, client = apiClient) {
  const response = await client.patch('/api/rider/location', { lat, lng });
  return response.data?.data;
}

/**
 * Record the collection. The server generates the barcode and returns it —
 * the app never invents one.
 */
export async function collectSample(bookingId, { temperature, notes } = {}, client = apiClient) {
  const response = await client.post(`/api/rider/jobs/${bookingId}/collect`, {
    ...(temperature === undefined ? {} : { temperature }),
    ...(notes ? { notes } : {}),
  });
  return response.data?.data;
}

/** Confirm cash taken from the patient at the door. */
export async function confirmCashReceived(bookingId, { amount, notes } = {}, client = apiClient) {
  const response = await client.post(`/api/rider/jobs/${bookingId}/cash-received`, {
    ...(amount === undefined ? {} : { amount }),
    ...(notes ? { notes } : {}),
  });
  return response.data?.data;
}

/** Hand off at the lab, with the closing cold-chain reading. */
export async function submitSampleAtLab(bookingId, { temperature, notes } = {}, client = apiClient) {
  const response = await client.post(`/api/rider/jobs/${bookingId}/submitted`, {
    ...(temperature === undefined ? {} : { temperature }),
    ...(notes ? { notes } : {}),
  });
  return response.data?.data;
}

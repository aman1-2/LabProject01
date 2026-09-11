import { apiClient } from './client.js';

/**
 * Patient endpoints — P01–P07. Nothing here is new API surface; these wrap
 * routes the web app already uses.
 */

export const patientKeys = {
  catalogue: (params) => ['catalogue', 'tests', params],
  test: (slug) => ['catalogue', 'test', slug],
  labs: (params) => ['catalogue', 'labs', params],
  bookings: (params) => ['bookings', params],
  booking: (id) => ['bookings', id],
  addresses: () => ['addresses'],
  familyMembers: () => ['family-members'],
  doctors: (params) => ['doctors', params],
  report: (bookingId) => ['reports', bookingId],
  me: () => ['users', 'me'],
};

/**
 * DESIGN_SPEC §3.4's four catalogue sections map 1:1 onto TestCatalog.category.
 * Packages are catalogue rows with category 'package' — there is no separate
 * package model or endpoint.
 */
export const CATALOGUE_SECTIONS = [
  { key: 'package', label: 'Full Body' },
  { key: 'plan', label: 'Care Plans' },
  { key: 'single', label: 'Single Tests' },
  { key: 'imaging', label: 'Imaging' },
];

export async function fetchCatalogue({ category = 'all', search = '', limit = 100 } = {}, client = apiClient) {
  const response = await client.get('/api/tests', { params: { category, search, limit } });
  return response.data?.data;
}

export async function fetchTestDetail(slug, client = apiClient) {
  const response = await client.get(`/api/tests/${slug}`);
  return response.data?.data;
}

export async function fetchLabsForTest({ lat, lng, testId, maxDistanceKm = 50 }, client = apiClient) {
  const response = await client.get('/api/labs/nearby', {
    params: { lat, lng, testId, maxDistanceKm },
  });
  return response.data?.data;
}

// ── Addresses ──────────────────────────────────────────────────────────────

export async function fetchAddresses(client = apiClient) {
  const response = await client.get('/api/addresses');
  return response.data?.data;
}

export async function createAddress(payload, client = apiClient) {
  const response = await client.post('/api/addresses', payload);
  return response.data?.data;
}

export async function updateAddress(id, payload, client = apiClient) {
  const response = await client.patch(`/api/addresses/${id}`, payload);
  return response.data?.data;
}

export async function deleteAddress(id, client = apiClient) {
  const response = await client.delete(`/api/addresses/${id}`);
  return response.data?.data;
}

// ── Family members ─────────────────────────────────────────────────────────

export async function fetchFamilyMembers(client = apiClient) {
  const response = await client.get('/api/family-members');
  return response.data?.data;
}

export async function createFamilyMember(payload, client = apiClient) {
  const response = await client.post('/api/family-members', payload);
  return response.data?.data;
}

export async function deleteFamilyMember(id, client = apiClient) {
  const response = await client.delete(`/api/family-members/${id}`);
  return response.data?.data;
}

// ── Bookings ───────────────────────────────────────────────────────────────

export async function fetchPatientBookings(params = {}, client = apiClient) {
  const response = await client.get('/api/bookings', { params });
  return response.data?.data;
}

export async function fetchPatientBooking(id, client = apiClient) {
  const response = await client.get(`/api/bookings/${id}`);
  return response.data?.data;
}

/**
 * The idempotency key is required: a double tap must not create two bookings
 * (CONTEXT §3.3). The caller generates it once per booking attempt and reuses
 * it across retries.
 */
export async function createPatientBooking(payload, idempotencyKey, client = apiClient) {
  const response = await client.post('/api/bookings', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data?.data;
}

export async function cancelPatientBooking(id, reason, client = apiClient) {
  const response = await client.patch(`/api/bookings/${id}/cancel`, reason ? { reason } : {});
  return response.data?.data;
}

// ── Payment ────────────────────────────────────────────────────────────────

/**
 * Creates the Razorpay order for a booking.
 *
 * Takes ONLY the bookingId. The amount is computed server-side from the live
 * catalogue, so no cached, bundled or client-held price can influence what is
 * charged (CONTEXT §3.2, §7.3).
 */
export async function createPaymentOrder(bookingId, client = apiClient) {
  const response = await client.post('/api/payments/create-order', { bookingId });
  return response.data?.data;
}

// ── Doctors & reports ──────────────────────────────────────────────────────

export async function fetchPartnerDoctors(params = {}, client = apiClient) {
  const response = await client.get('/api/doctors', { params });
  return response.data?.data;
}

export async function fetchDoctorSpecialties(client = apiClient) {
  const response = await client.get('/api/doctors/specialties');
  return response.data?.data;
}

export async function fetchReport(bookingId, client = apiClient) {
  const response = await client.get(`/api/reports/${bookingId}`);
  return response.data?.data;
}

// ── Subscriptions ──────────────────────────────────────────────────────────

export const subscriptionKeys = {
  all: () => ['subscriptions'],
  detail: (id) => ['subscriptions', id],
};

/**
 * Creates the mandate and returns `{ subscription, authorizationUrl }`.
 *
 * No amount is sent: the mandate's value is computed server-side from the live
 * catalogue and frozen onto the subscription (CONTEXT §3.2). Nothing is
 * charged until the patient approves the mandate at `authorizationUrl`.
 */
export async function createSubscription(payload, client = apiClient) {
  const response = await client.post('/api/subscriptions', payload);
  return response.data?.data;
}

export async function fetchSubscriptions(client = apiClient) {
  const response = await client.get('/api/subscriptions');
  return response.data?.data;
}

export async function fetchSubscription(id, client = apiClient) {
  const response = await client.get(`/api/subscriptions/${id}`);
  return response.data?.data;
}

export async function pauseSubscription(id, client = apiClient) {
  const response = await client.post(`/api/subscriptions/${id}/pause`);
  return response.data?.data;
}

export async function resumeSubscription(id, client = apiClient) {
  const response = await client.post(`/api/subscriptions/${id}/resume`);
  return response.data?.data;
}

export async function cancelSubscription(id, reason = null, client = apiClient) {
  const response = await client.post(`/api/subscriptions/${id}/cancel`, reason ? { reason } : {});
  return response.data?.data;
}

/** Patient-facing wording for each mandate state, and the tone that carries it. */
export const SUBSCRIPTION_STATUS = {
  pending_authorization: { label: 'Awaiting approval', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  paused: { label: 'Paused', tone: 'grey' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  // "Halted" is gateway jargon; the patient needs to know their bank stopped it.
  halted: { label: 'Stopped by your bank', tone: 'red' },
};

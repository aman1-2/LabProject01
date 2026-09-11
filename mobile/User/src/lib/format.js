/**
 * Presentation helpers.
 *
 * Nothing here computes a price or a fee — amounts come from the server and are
 * only formatted (CONTEXT §3.4, and §7.3's "never charge using a cached price").
 */

/** Booking amounts are stored in rupees. */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export function formatSlot(value) {
  if (!value) return 'Slot not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Slot not set';
  return date.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** A booking is either a package or a list of tests. */
export function testNamesOf(booking) {
  if (booking?.packageId?.name) return booking.packageId.name;
  const tests = booking?.testIds;
  if (Array.isArray(tests) && tests.length > 0) {
    const names = tests.map((test) => test?.name).filter(Boolean);
    if (names.length === 0) return `${tests.length} test${tests.length === 1 ? '' : 's'}`;
    if (names.length <= 2) return names.join(' + ');
    return `${names[0]} + ${names.length - 1} more`;
  }
  return 'Home collection';
}

/** Booking status labels, matching the web platform's wording. */
export const STATUS_LABELS = {
  pending: 'Pending',
  rider_assigned: 'Assigned',
  en_route: 'En route',
  collected: 'Collected',
  at_lab: 'At lab',
  processing: 'Processing',
  report_ready: 'Report ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_TONES = {
  pending: 'grey',
  rider_assigned: 'blue',
  en_route: 'blue',
  collected: 'green',
  at_lab: 'green',
  processing: 'amber',
  report_ready: 'green',
  completed: 'green',
  cancelled: 'red',
};

/**
 * Cold-chain guidance shown next to the temperature field.
 *
 * These are display bounds for the rider, not a validation rule — the server's
 * schema (-30..60) is the authority on what is accepted. Flagging an unusual
 * reading is useful; silently blocking a real measurement is not, because the
 * reading is evidence about the sample, and a refused entry means no record at all.
 */
export const COLD_CHAIN_ADVISORY = { min: 2, max: 8 };

export function coldChainAdvice(temperature) {
  const value = Number(temperature);
  if (temperature === '' || temperature === null || Number.isNaN(value)) return null;
  if (value < COLD_CHAIN_ADVISORY.min) return 'Below the usual 2–8°C range — record it and flag the box.';
  if (value > COLD_CHAIN_ADVISORY.max) return 'Above the usual 2–8°C range — record it and flag the box.';
  return null;
}

/** Prototype home greeting. */
export function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The patient-facing status stepper (DESIGN_SPEC §3.7 / §4).
 *
 * Home collection and lab visit are different journeys (§5.2), so the steps
 * shown depend on the booking's mode rather than being one hardcoded list.
 */
export const HOME_STEPS = [
  { key: 'pending', label: 'Booked' },
  { key: 'rider_assigned', label: 'Rider assigned' },
  { key: 'en_route', label: 'En route' },
  { key: 'collected', label: 'Collected' },
  { key: 'report_ready', label: 'Report ready' },
];

export const VISIT_STEPS = [
  { key: 'awaiting_confirm', label: 'Booked' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'collected', label: 'Sample collected' },
  { key: 'at_lab', label: 'At lab' },
  { key: 'report_ready', label: 'Report ready' },
];

/** Statuses that mean a step is behind us, in journey order. */
const PROGRESSION = [
  'pending',
  'awaiting_confirm',
  'confirmed',
  'rider_assigned',
  'en_route',
  'collected',
  'at_lab',
  'processing',
  'report_ready',
  'completed',
];

export function stepsForBooking(booking) {
  const steps = booking?.mode === 'visit' ? VISIT_STEPS : HOME_STEPS;
  const currentRank = PROGRESSION.indexOf(booking?.status);

  return steps.map((step) => {
    const stepRank = PROGRESSION.indexOf(step.key);
    if (currentRank < 0) return { ...step, state: 'upcoming' };
    if (stepRank < currentRank) return { ...step, state: 'done' };
    if (stepRank === currentRank) return { ...step, state: 'current' };
    return { ...step, state: 'upcoming' };
  });
}

/**
 * Home collection availability, phrased as DESIGN_SPEC §6 requires: explain
 * WHY, not just what.
 */
export function homeCollectionNote(test) {
  if (test?.homeCollectionAvailable) return null;
  return 'Home collection is not available for this test — it needs lab equipment.';
}

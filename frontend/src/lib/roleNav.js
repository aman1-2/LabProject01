/**
 * What each role can reach, in one place.
 *
 * The navbar, the mobile drawer and the account menu all need this list. Three
 * copies of it drift the moment a console is added, and the way that failure
 * shows up is a staff member who can reach their tool from the desktop nav but
 * not from their phone.
 *
 * THIS IS PRESENTATION, NOT SECURITY.
 *
 * Hiding a link stops it being *offered*; it does not stop anyone typing the
 * URL. The routes are gated by `RoleProtectedRoute` and the data behind them by
 * `hasRole` on the server. This module decides what to show, and nothing more —
 * if it is ever the only thing standing between a patient and a console, that
 * is a bug in the route table, not here.
 */

/**
 * Staff tools, keyed by role.
 *
 * `super_admin` gets the doctor dashboard too because the API allows it
 * (`hasRole('doctor', 'super_admin')` on /api/doctors/dashboard), and a nav
 * that hides something the caller is authorised for is its own kind of wrong.
 */
const ROLE_TOOLS = {
  doctor: [
    {
      key: 'doctor-dashboard',
      to: '/doctor/dashboard',
      label: 'My dashboard',
      icon: 'stethoscope',
      description: 'Referred patients and their reports',
    },
  ],
  lab_admin: [
    {
      key: 'lab-console',
      to: '/lab/console',
      label: 'Lab console',
      icon: 'microscope',
      description: 'Your centre’s queue and reports',
    },
  ],
  super_admin: [
    {
      key: 'admin-console',
      to: '/admin',
      label: 'Admin console',
      icon: 'chart',
      description: 'Bookings, riders and operations',
    },
    {
      key: 'doctor-dashboard',
      to: '/doctor/dashboard',
      label: 'Doctor dashboard',
      icon: 'stethoscope',
      description: 'Referral view',
    },
  ],
};

/** Every role that has something extra in the interface. */
export const STAFF_ROLES = Object.keys(ROLE_TOOLS);

/**
 * The tools this user should be offered. Always an array, so callers can map
 * over it without a null check — a patient simply gets an empty one.
 */
export function toolsForRole(role) {
  return ROLE_TOOLS[role] ?? [];
}

/** True when the interface should show a staff area at all. */
export function isStaff(role) {
  return toolsForRole(role).length > 0;
}

/**
 * How to describe the account in the interface. Patients are not labelled —
 * "Patient" next to your own name is noise on a product where being a patient
 * is the default.
 */
export function roleLabel(role) {
  switch (role) {
    case 'doctor':
      return 'Doctor';
    case 'lab_admin':
      return 'Lab admin';
    case 'super_admin':
      return 'Admin';
    case 'rider':
      return 'Phlebotomist';
    default:
      return null;
  }
}

export default { toolsForRole, isStaff, roleLabel, STAFF_ROLES };

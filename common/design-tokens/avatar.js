/**
 * Avatar identity: what colour and what letters represent a person.
 *
 * This lives in the shared tokens rather than in either client because both
 * the website and the app show the same patient, and they have to agree. Two
 * copies of this function drift the moment one palette gains a colour, and the
 * symptom — the same person being teal in the app and purple on the web — is
 * the kind of thing that reads as a bug in the account, not in the palette.
 *
 * The colour is DERIVED, never stored and never random: the same name always
 * produces the same colour, on every device, with no round trip.
 */

/**
 * Deliberately not the brand ramp. These are picked to stay distinguishable
 * from each other and to carry white text at 4.5:1 or better, which the
 * lighter brand blues do not.
 */
export const avatarColors = [
  '#2C4BC7',
  '#0284C7',
  '#0D9488',
  '#16A34A',
  '#D97706',
  '#9333EA',
  '#E11D48',
];

/**
 * A stable colour for a name.
 *
 * djb2-style string hash. It is not cryptographic and does not need to be —
 * all that is required is that it is deterministic and spreads names across
 * the palette. `Math.abs` matters: the shifts overflow into negatives for
 * longer names, and a negative index silently yields `undefined`.
 */
export function getAvatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

/**
 * Up to two initials, e.g. "Aman Pratap Singh" -> "AP".
 *
 * Falls back to 'U' rather than an empty string: an avatar with nothing in it
 * looks like a failed image load, which is exactly the wrong signal.
 */
export function getInitials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || 'U'
  );
}

export default { avatarColors, getAvatarColor, getInitials };

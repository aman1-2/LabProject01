/**
 * Deterministic doctor name normalisation utility
 * Collapses near-identical external mentions (e.g., "Dr. A.K. Sharma, MD" and "dr a.k. sharma")
 * into a single canonical recruitment lead.
 */
export function normalizeDoctorName(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let s = raw.trim().toLowerCase();

  // Strip common honorific titles at the start: "dr.", "dr", "doctor", "prof.", "prof"
  s = s.replace(/^(dr\.|dr\b|doctor\b|prof\.|prof\b)\s*/i, '');

  // Strip common medical qualification suffixes: ", md", ", mbbs", " md", " mbbs", " ms", " dnb", etc.
  s = s.replace(/,\s*(md|mbbs|ms|dnb|bams|bhms|frcs|mrco|phd)\b/gi, '');
  s = s.replace(/\b(md|mbbs|ms|dnb|bams|bhms|frcs|mrco|phd)\b$/gi, '');

  // Strip punctuation (dots, commas, dashes, underscores, quotes)
  s = s.replace(/[.,\-_'"]/g, ' ');

  // Collapse consecutive whitespace and trim
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

export default {
  normalizeDoctorName,
};

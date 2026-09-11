import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * BLOCKER #3 regression.
 *
 * `adminService.js` and `feedbackService.js` imported '../utils/appError.js'
 * while the file on disk is 'AppError.js'. Windows and macOS resolve that;
 * Linux (ECS Fargate, CONTEXT §4.2) does not, so `createApp()` threw
 * ERR_MODULE_NOT_FOUND at import time and the API never started.
 *
 * This check is deliberately STATIC rather than a runtime import. On a
 * case-insensitive filesystem a runtime `import()` succeeds even with the
 * defect present — which is exactly why it survived fourteen features and a
 * green test suite. Comparing the requested specifier against the real
 * directory entry catches it on every platform.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../src');

// Matches: import x from './y.js' | export * from '../z.js' | await import('./q.js')
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;

function collectJsFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Resolve a relative specifier and report how its casing compares to disk.
 * Returns null when the import is fine.
 */
function findResolutionProblem(sourceFile, specifier) {
  const target = path.resolve(path.dirname(sourceFile), specifier);
  const dir = path.dirname(target);
  const requested = path.basename(target);

  if (!fs.existsSync(dir)) {
    return `directory does not exist: ${dir}`;
  }

  const entries = fs.readdirSync(dir);

  // Exact, byte-for-byte match is what a case-sensitive filesystem requires.
  if (entries.includes(requested)) {
    return null;
  }

  // A directory import resolving to index.js is legitimate.
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return null;
  }

  const caseOnly = entries.find((e) => e.toLowerCase() === requested.toLowerCase());
  if (caseOnly) {
    return `case mismatch — imported '${requested}' but the file is '${caseOnly}'. This resolves on Windows/macOS and fails on Linux.`;
  }

  return `unresolved import '${requested}' — no such file in ${dir}`;
}

describe('Module resolution is case-correct (BLOCKER #3)', () => {
  const sourceFiles = collectJsFiles(SRC_ROOT);

  it('finds source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  it('every relative import in backend/src matches the on-disk filename exactly', () => {
    const problems = [];

    for (const file of sourceFiles) {
      const contents = fs.readFileSync(file, 'utf8');
      for (const match of contents.matchAll(RELATIVE_IMPORT)) {
        const specifier = match[1];
        const problem = findResolutionProblem(file, specifier);
        if (problem) {
          problems.push(`${path.relative(SRC_ROOT, file).replace(/\\/g, '/')}: ${problem}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('AppError is imported with its real capitalisation everywhere', () => {
    // The specific defect, pinned so a regression is unmistakable in the report.
    const offenders = [];

    for (const file of sourceFiles) {
      const contents = fs.readFileSync(file, 'utf8');
      for (const match of contents.matchAll(RELATIVE_IMPORT)) {
        const specifier = match[1];
        if (
          specifier.toLowerCase().endsWith('apperror.js') &&
          !specifier.endsWith('AppError.js')
        ) {
          offenders.push(
            `${path.relative(SRC_ROOT, file).replace(/\\/g, '/')} imports '${specifier}'`
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

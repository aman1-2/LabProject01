import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = path.join(root, 'public', 'img');

/**
 * A broken <img> is invisible in a unit test — jsdom never fetches it, so a
 * typo'd filename or a photo dropped during a cleanup sails through the whole
 * suite and shows up as a grey box on the landing page in production.
 */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(entry.name) ? [full] : [];
  });
}

describe('image assets', () => {
  const referenced = new Map();

  for (const file of sourceFiles(path.join(root, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/["'`]\/img\/([\w.-]+\.(?:jpg|jpeg|png|webp|svg|avif))/g)) {
      referenced.set(match[1], path.relative(root, file));
    }
  }

  it('finds the images the pages reference', () => {
    // If this is ever zero the assertion below becomes vacuous.
    expect(referenced.size).toBeGreaterThan(0);
  });

  it.each([...referenced.keys()])('%s exists on disk', (name) => {
    expect(fs.existsSync(path.join(IMG_DIR, name))).toBe(true);
  });

  it('credits every photograph it ships', () => {
    // The licence does not require attribution; we record it anyway, and an
    // uncredited file is a sign one was added without checking its licence.
    const credits = fs.readFileSync(path.join(IMG_DIR, 'CREDITS.md'), 'utf8');
    const photos = fs
      .readdirSync(IMG_DIR)
      .filter((name) => /\.(jpg|jpeg|png|webp|avif)$/i.test(name));

    expect(photos.length).toBeGreaterThan(0);
    for (const photo of photos) {
      expect(credits).toContain(photo);
    }
  });
});

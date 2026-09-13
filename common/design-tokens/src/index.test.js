import test from 'node:test';
import assert from 'node:assert';
import { colors, space, radius, type, fontFamily, shadow, tokens } from './index.js';

/**
 * HIGH H12 regression.
 *
 * This suite previously imported `spacing` and `typography`, which this package
 * has never exported, so it threw at import time and `pnpm test` — the exact
 * command .github/workflows/ci.yml runs — exited 1. Nothing gated merges.
 *
 * The assertions were fictional too: `colors.primary[500]`, `spacing[4] ===
 * '16px'`, `radius.md === '8px'`, `typography.fontFamily.sans`. None of those
 * shapes has ever existed here. Renaming the imports would have produced a
 * suite that ran and still asserted nothing true.
 *
 * DESIGN_SPEC §1.1: "These are exact. Copy them into common/design-tokens/
 * verbatim — do not approximate, do not pick 'similar' colours." So the tokens
 * are pinned to the specified values.
 */

test('colour ramp matches DESIGN_SPEC §1.1 exactly', () => {
  assert.strictEqual(colors.blue900, '#101635');
  assert.strictEqual(colors.blue700, '#2C4BC7');
  assert.strictEqual(colors.blue600, '#3E63DD');
  assert.strictEqual(colors.blue500, '#4F72E8');
  assert.strictEqual(colors.blue100, '#E8EDFC');
  assert.strictEqual(colors.blue50, '#F4F7FE');
});

test('neutrals match DESIGN_SPEC §1.1 exactly', () => {
  assert.strictEqual(colors.ink, '#14161A');
  assert.strictEqual(colors.muted, '#6B7280');
  assert.strictEqual(colors.muted2, '#9CA3AF');
  assert.strictEqual(colors.bg, '#F7F8FC');
  assert.strictEqual(colors.border, '#E7E9F0');
  assert.strictEqual(colors.dark, '#101114');
  assert.strictEqual(colors.white, '#FFFFFF');
});

test('semantic colours match DESIGN_SPEC §1.1 exactly', () => {
  assert.strictEqual(colors.green, '#16A34A');
  assert.strictEqual(colors.greenBg, '#DCFCE7');
  assert.strictEqual(colors.amber, '#F59E0B');
  assert.strictEqual(colors.amberBg, '#FEF3C7');
  assert.strictEqual(colors.red, '#EF4444');
  assert.strictEqual(colors.redBg, '#FEE2E2');
  assert.strictEqual(colors.redDark, '#DC2626');
});

test('page background is the tinted surface, never pure white', () => {
  // §1.1: "Page background is bg (#F7F8FC), never pure white. This contrast is
  // what makes the interface read as layered."
  assert.notStrictEqual(colors.bg, colors.white);
  assert.strictEqual(colors.bg, '#F7F8FC');
});

test('spacing scale matches DESIGN_SPEC §1.3', () => {
  assert.deepStrictEqual(space, {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
  });
});

test('radius scale matches DESIGN_SPEC §1.3, including the pill', () => {
  assert.deepStrictEqual(radius, {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    pill: 999,
  });
  // §2.1: "Buttons are always fully pill-shaped."
  assert.strictEqual(radius.pill, 999);
});

test('shadows match DESIGN_SPEC §1.3', () => {
  assert.strictEqual(shadow.card, '0 16px 32px -14px rgba(16,20,53,.18)');
  assert.strictEqual(shadow.float, '0 20px 40px -12px rgba(16,20,40,.18)');
  assert.strictEqual(shadow.fab, '0 10px 24px -6px rgba(22,163,74,.55)');
});

test('every heading weight is 800 with negative tracking', () => {
  // §1.2: "All headings use weight 800 with negative letter-spacing. This is
  // the single most recognisable part of the type treatment — do not use 600
  // or 700 for headings."
  for (const name of ['heroTitle', 'pageTitle', 'sectionTitle']) {
    assert.strictEqual(type[name].weight, 800, `${name} must be weight 800`);
    assert.ok(
      type[name].tracking.startsWith('-'),
      `${name} must have negative letter-spacing`
    );
  }
  assert.strictEqual(type.cardTitle.weight, 800);
  assert.strictEqual(type.price.weight, 800);
});

test('type scale sizes match DESIGN_SPEC §1.2', () => {
  assert.strictEqual(type.heroTitle.size, 50);
  assert.strictEqual(type.pageTitle.size, 29);
  assert.strictEqual(type.sectionTitle.size, 27);
  assert.strictEqual(type.body.size, 15);
  assert.strictEqual(type.bodySmall.size, 13.5);
  assert.strictEqual(type.caption.size, 12.5);
  assert.strictEqual(type.price.size, 19);
});

test('eyebrow is uppercase with positive tracking', () => {
  assert.strictEqual(type.eyebrow.transform, 'uppercase');
  assert.strictEqual(type.eyebrow.weight, 700);
});

test('font family is Plus Jakarta Sans with a real fallback stack', () => {
  assert.ok(fontFamily.sans.includes('"Plus Jakarta Sans"'));
  assert.ok(fontFamily.sans.length > 1, 'must provide fallbacks');
});

test('the aggregate tokens object exposes every group', () => {
  assert.deepStrictEqual(Object.keys(tokens).sort(), [
    // The avatar palette is a token group like any other: web and mobile both
    // pick a person's colour from it, so the two must never diverge.
    'avatarColors',
    'colors',
    'fontFamily',
    'radius',
    'shadow',
    'space',
    'type',
  ]);
});

import test from 'node:test';
import assert from 'node:assert';
import { avatarColors, getAvatarColor, getInitials } from '../avatar.js';

/**
 * These are shared by the website and the app, so the property that matters is
 * agreement: the same name must produce the same colour and letters wherever
 * it is rendered.
 */

test('a name always produces the same colour', () => {
  assert.strictEqual(getAvatarColor('Aman Pratap Singh'), getAvatarColor('Aman Pratap Singh'));
});

test('different names generally differ', () => {
  assert.notStrictEqual(getAvatarColor('Aman'), getAvatarColor('Zoya'));
});

test('every name lands inside the palette, including long ones', () => {
  // The hash shifts overflow into negatives for longer strings; without
  // Math.abs the index is negative and the lookup silently yields undefined.
  const names = ['A', 'Aman', 'Aman Pratap Singh', 'x'.repeat(200), '', '   ', '🙂 Ravi'];
  for (const name of names) {
    assert.ok(avatarColors.includes(getAvatarColor(name)), `outside palette: "${name.slice(0, 20)}"`);
  }
});

test('initials take at most two words, uppercased', () => {
  assert.strictEqual(getInitials('Aman Pratap Singh'), 'AP');
  assert.strictEqual(getInitials('cher'), 'C');
  assert.strictEqual(getInitials('  ravi   kumar  '), 'RK');
});

test('a missing name still renders something', () => {
  // An empty avatar looks like a failed image load, which is the wrong signal.
  assert.strictEqual(getInitials(''), 'U');
  assert.strictEqual(getInitials('   '), 'U');
  assert.strictEqual(getInitials(), 'U');
});

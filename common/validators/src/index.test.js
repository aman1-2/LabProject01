import test from 'node:test';
import assert from 'node:assert';
import {
  accountHandleSchema,
  phoneSchema,
  passwordSchema,
  signupSchema,
  loginPasswordSchema,
  verifyOtpSchema,
} from './index.js';

test('accountHandleSchema validates and transforms correctly', () => {
  assert.strictEqual(accountHandleSchema.parse('Aman_01'), 'aman_01');
  assert.throws(() => accountHandleSchema.parse('ab')); // too short
  assert.throws(() => accountHandleSchema.parse('invalid-handle!')); // special characters
});

test('phoneSchema validates 10-digit Indian numbers', () => {
  assert.strictEqual(phoneSchema.parse('9876543210'), '9876543210');
  assert.throws(() => phoneSchema.parse('1234567890')); // doesn't start with 6-9
  assert.throws(() => phoneSchema.parse('987654321')); // 9 digits
});

test('passwordSchema enforces length and composition', () => {
  assert.strictEqual(passwordSchema.parse('secret123'), 'secret123');
  assert.throws(() => passwordSchema.parse('short1')); // < 8 chars
  assert.throws(() => passwordSchema.parse('onlyletters')); // no numbers
});

test('signupSchema validates complete payload', () => {
  const valid = {
    accountHandle: 'aman_patient',
    phone: '9876543210',
    name: 'Aman Pathak',
    password: 'securePassword1',
    accountType: 'single',
    location: {
      lat: 30.3165,
      lng: 78.0322,
      address: 'Rajpur Road, Dehradun',
      source: 'geo',
    },
  };

  const parsed = signupSchema.parse(valid);
  assert.strictEqual(parsed.accountHandle, 'aman_patient');
  assert.strictEqual(parsed.accountType, 'single');
});

test('verifyOtpSchema requires 6 digits', () => {
  assert.strictEqual(verifyOtpSchema.parse({ otpToken: 'token-123', otp: '123456' }).otp, '123456');
  assert.throws(() => verifyOtpSchema.parse({ otpToken: 'token-123', otp: '12345' }));
  assert.throws(() => verifyOtpSchema.parse({ otpToken: 'token-123', otp: '12345a' }));
});

test('createBookingSchema validates booking payloads', async () => {
  const { createBookingSchema } = await import('./index.js');
  const valid = {
    testIds: ['test-123'],
    labCenterId: 'lab-456',
    mode: 'home',
    // A home collection has to say where. Without it the rider is dispatched to
    // nowhere, which is what the schema now refuses.
    addressId: 'addr-321',
    slotDateTime: new Date().toISOString(),
    referralSource: {
      type: 'partner',
      partnerDoctorId: 'doc-789',
    },
  };
  const parsed = createBookingSchema.parse(valid);
  assert.strictEqual(parsed.mode, 'home');
  assert.strictEqual(parsed.referralSource.type, 'partner');
  assert.strictEqual(parsed.paymentMode, 'upi');

  // Should throw if both testIds and packageId are missing
  assert.throws(() => createBookingSchema.parse({
    labCenterId: 'lab-456',
    mode: 'home',
    addressId: 'addr-321',
    slotDateTime: new Date().toISOString(),
  }));

  // Home collection without an address is rejected...
  assert.throws(
    () => createBookingSchema.parse({ ...valid, addressId: undefined }),
    /addressId is required for home collection/
  );

  // ...while a visit to the centre legitimately has no address.
  const walkIn = createBookingSchema.parse({ ...valid, mode: 'visit', addressId: undefined });
  assert.strictEqual(walkIn.mode, 'visit');
});

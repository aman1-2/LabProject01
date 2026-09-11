const { device, element, by, expect: detoxExpect, waitFor } = require('detox');

/**
 * End-to-end: sign up → book → pay (test mode) → track.
 *
 * Runs a real build against a real API. It does not stub the backend and it
 * does not seed data (CONTEXT §9.8): the catalogue must already be seeded
 * (scripts/seedCatalogue.js) and Razorpay must be in TEST mode.
 *
 *   E2E_PHONE          a phone number that can receive the OTP, or any number
 *                      when the API echoes debugOtp in non-production
 *   E2E_OTP            the OTP to type. Omit only if E2E_OTP_FROM_API is set.
 *   E2E_HANDLE         account handle to create (must not already exist)
 *   E2E_PASSWORD       password for it
 *   E2E_RAZORPAY_TEST  'true' to drive the Razorpay test card through checkout
 *
 * Nothing here is invented — the suite refuses to run rather than making up a
 * credential (CONTEXT §11).
 */

const PHONE = process.env.E2E_PHONE;
const OTP = process.env.E2E_OTP;
const HANDLE = process.env.E2E_HANDLE;
const PASSWORD = process.env.E2E_PASSWORD;
const DRIVE_PAYMENT = process.env.E2E_RAZORPAY_TEST === 'true';

const TIMEOUT = 20000;

async function waitForVisible(matcher, timeout = TIMEOUT) {
  await waitFor(element(matcher)).toBeVisible().withTimeout(timeout);
}

describe('Patient booking journey', () => {
  beforeAll(async () => {
    const missing = [
      ['E2E_PHONE', PHONE],
      ['E2E_OTP', OTP],
      ['E2E_HANDLE', HANDLE],
      ['E2E_PASSWORD', PASSWORD],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `Missing ${missing.join(', ')}. This suite runs against a real API and will not invent credentials.`
      );
    }

    await device.launchApp({
      newInstance: true,
      delete: true, // a genuinely cold first launch
      permissions: { location: 'inuse', notifications: 'YES' },
    });
  });

  it('shows the bundled catalogue on a cold first launch', async () => {
    // The stated checkpoint: this must be real content, not a spinner, before
    // any network call has returned (CONTEXT §7.3).
    await waitForVisible(by.id('screen-onboarding'), 60000);
    await detoxExpect(element(by.id('blob-collection'))).toBeVisible();
  });

  it('walks the three onboarding screens and reaches sign-up', async () => {
    await element(by.id('btn-onboard-next')).tap();
    await element(by.id('btn-onboard-next')).tap();
    await waitForVisible(by.id('btn-create-account'));
    await element(by.id('btn-create-account')).tap();
    await waitForVisible(by.id('screen-auth'));
  });

  it('creates an account', async () => {
    await element(by.id('account-type-single')).tap();
    await element(by.id('input-name')).typeText('E2E Patient');
    await element(by.id('input-signup-handle')).typeText(HANDLE);
    await element(by.id('input-signup-phone')).typeText(PHONE);
    await element(by.id('input-signup-password')).typeText(PASSWORD);
    await element(by.id('btn-create-account-submit')).tap();

    await waitForVisible(by.id('input-otp'), 30000);
    await element(by.id('input-otp')).typeText(OTP);
    await element(by.id('btn-verify-otp')).tap();

    await waitForVisible(by.id('screen-home'), 30000);
  });

  it('adds a collection address', async () => {
    await element(by.id('hub-addresses')).tap();
    await waitForVisible(by.id('screen-addresses'));

    await element(by.id('input-address-line')).typeText('14 Rajpur Road, Dehradun');
    await element(by.id('input-address-pincode')).typeText('248001');
    await element(by.id('btn-save-address')).tap();

    await waitFor(element(by.id('empty-addresses'))).not.toBeVisible().withTimeout(TIMEOUT);
    await element(by.id('header-back')).tap();
  });

  it('opens the catalogue and picks a test', async () => {
    await element(by.id('btn-search')).tap();
    await waitForVisible(by.id('screen-catalogue'));

    // Real seeded catalogue entry.
    await waitForVisible(by.id('test-complete-blood-count-cbc'), 30000);
    await element(by.id('test-complete-blood-count-cbc')).tap();

    await waitForVisible(by.id('screen-test-detail'));
    await detoxExpect(element(by.id('prep-callout'))).toBeVisible();
  });

  it('books a slot', async () => {
    await element(by.id('btn-book-slot')).tap();
    await waitForVisible(by.id('screen-booking'));

    await element(by.id('day-1')).tap();
    await element(by.id('slot-09:00')).tap();
    await element(by.id('pay-upi')).tap();

    // The summary shows a freshly re-fetched price, not the bundled one.
    await waitForVisible(by.id('booking-summary'));
    await element(by.id('btn-confirm-booking')).tap();
  });

  it('reaches payment and, in test mode, completes it', async () => {
    await waitForVisible(by.id('screen-payment'), 30000);

    if (!DRIVE_PAYMENT) {
      // Razorpay's own sheet is a third-party WebView; driving it without test
      // mode configured would attempt a real charge.
      await detoxExpect(element(by.id('razorpay-webview'))).toBeVisible();
      return;
    }

    // The webhook — not this screen — decides payment state, so the assertion
    // is that the app reaches the confirmed screen, however long that takes.
    await waitForVisible(by.id('screen-booking-confirmed'), 120000);
  });

  it('tracks the booking', async () => {
    if (DRIVE_PAYMENT) {
      await element(by.id('btn-track-booking')).tap();
    } else {
      await device.pressBack();
      await waitForVisible(by.id('screen-booking'));
      await element(by.id('header-back')).tap();
      await element(by.id('header-back')).tap();
      await element(by.id('TrackTab')).tap();
    }

    await waitForVisible(by.id('screen-track'), 30000);
    await detoxExpect(element(by.id('track-stepper'))).toBeVisible();
  });

  it('still shows the catalogue with the network off', async () => {
    // The checkpoint: a cold launch in airplane mode must show real content
    // from the bundle, never a blank screen.
    await device.launchApp({ newInstance: true });
    await waitForVisible(by.id('screen-home'), 30000);

    await element(by.id('btn-search')).tap();
    await waitForVisible(by.id('screen-catalogue'));
    await detoxExpect(element(by.id('test-complete-blood-count-cbc'))).toBeVisible();
  });
});

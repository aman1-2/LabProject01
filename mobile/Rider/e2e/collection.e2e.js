const { device, element, by, expect: detoxExpect, waitFor } = require('detox');

/**
 * End-to-end: accept a job, collect the sample, scan the vial, hand off at lab.
 *
 * This drives a real build against a real API. It does not stub the backend and
 * it does not seed data (CONTEXT §9.8) — it needs a rider account and a pending
 * home-collection booking at that rider's lab centre, supplied through the
 * environment. Credentials are never committed:
 *
 *   E2E_RIDER_HANDLE     account handle of a rider account
 *   E2E_RIDER_PASSWORD   its password
 *   E2E_EXPECTED_BARCODE the barcode issued at collection, for the scan step
 *
 * The camera step is the one part that cannot be fully automated. An emulator
 * has no real camera and Detox cannot present a physical barcode to a lens, so
 * on a device without a scannable label the test asserts the scanner reaches its
 * live, permission-granted state and stops there. The full scan is verified by
 * hand on a physical device, which is the stated checkpoint for this app.
 */

const HANDLE = process.env.E2E_RIDER_HANDLE;
const PASSWORD = process.env.E2E_RIDER_PASSWORD;
const CAN_SCAN = process.env.E2E_CAN_SCAN === 'true';

const TIMEOUT = 20000;

async function waitForVisible(matcher, timeout = TIMEOUT) {
  await waitFor(element(matcher)).toBeVisible().withTimeout(timeout);
}

describe('Phlebotomist collection run', () => {
  beforeAll(async () => {
    if (!HANDLE || !PASSWORD) {
      throw new Error(
        'E2E_RIDER_HANDLE and E2E_RIDER_PASSWORD must be set. This suite runs against a real API and will not invent credentials.'
      );
    }

    await device.launchApp({
      newInstance: true,
      permissions: { camera: 'YES', location: 'always', notifications: 'YES' },
    });
  });

  it('signs in', async () => {
    await waitForVisible(by.id('screen-login'), 60000);

    await element(by.id('input-handle')).typeText(HANDLE);
    await element(by.id('input-password')).typeText(PASSWORD);
    await element(by.id('btn-signin')).tap();

    await waitForVisible(by.id('screen-jobs'), 30000);
  });

  it('accepts an available job', async () => {
    await waitForVisible(by.id('screen-jobs'));

    // Either a job is already held, or one is available to claim.
    try {
      await detoxExpect(element(by.id('card-active-job'))).toBeVisible();
      await element(by.id('btn-open-active-job')).tap();
    } catch {
      await waitFor(element(by.id('screen-jobs')))
        .toBeVisible()
        .withTimeout(TIMEOUT);
      // The first available card's accept button. Ids are per-booking, so this
      // matches on the shared prefix rather than a hardcoded booking id.
      await element(by.id(/^btn-accept-/)).atIndex(0).tap();
    }

    await waitForVisible(by.id('screen-job-detail'), 30000);
    await detoxExpect(element(by.id('kv-patient-name'))).toBeVisible();
  });

  it('records the collection with a cold-chain reading', async () => {
    await element(by.id('btn-start-collection')).tap();
    await waitForVisible(by.id('screen-collection'));

    await element(by.id('input-temperature')).typeText('4.5');
    await element(by.id('btn-confirm-collection')).tap();

    await waitForVisible(by.id('screen-collection-done'), 30000);
    // The barcode is issued by the server, not by the app.
    await detoxExpect(element(by.id('text-barcode'))).toBeVisible();

    await element(by.id('btn-collection-done')).tap();
    await waitForVisible(by.id('screen-job-detail'));
  });

  it('confirms cash when the booking is cash on collection', async () => {
    let cashDue = true;
    try {
      await detoxExpect(element(by.id('btn-collect-cash'))).toBeVisible();
    } catch {
      cashDue = false;
    }

    if (!cashDue) return;

    await element(by.id('btn-collect-cash')).tap();
    await waitForVisible(by.id('screen-cash'));

    // Two steps on purpose: a mis-tap marks a booking paid that nobody paid for.
    await element(by.id('btn-cash-arm')).tap();
    await element(by.id('btn-cash-confirm-final')).tap();

    await waitForVisible(by.id('screen-cash-done'), 30000);
    await element(by.id('btn-cash-done')).tap();
    await waitForVisible(by.id('screen-job-detail'));
  });

  it('scans the vial and hands off at the lab', async () => {
    await element(by.id('btn-handoff')).tap();
    await waitForVisible(by.id('screen-handoff'));

    // The scanner must be live — permission granted and the camera running —
    // before anything can be scanned.
    await waitForVisible(by.id('barcode-scanner'));

    if (!CAN_SCAN) {
      // No real barcode in front of the lens. Submission stays correctly
      // blocked, which is itself the assertion worth making here.
      await detoxExpect(element(by.id('handoff-hint'))).toBeVisible();
      return;
    }

    await waitForVisible(by.id('scan-confirmed'), 60000);

    await element(by.id('input-handoff-temperature')).typeText('5.0');
    await element(by.id('btn-submit-handoff')).tap();

    await waitForVisible(by.id('screen-handoff-done'), 30000);
    await element(by.id('btn-handoff-done')).tap();
    await waitForVisible(by.id('screen-jobs'));
  });
});

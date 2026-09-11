import crypto from 'crypto';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import { User } from '../../src/schemas/User.js';
import { TestCatalog } from '../../src/schemas/TestCatalog.js';
import { LabCenter } from '../../src/schemas/LabCenter.js';
import { Booking } from '../../src/schemas/Booking.js';
import { Subscription } from '../../src/schemas/Subscription.js';
import { razorpayConfig } from '../../src/config/razorpayConfig.js';
import { processPaymentJob } from '../../src/processors/paymentProcessor.js';
import { processSubscriptionSweepJob } from '../../src/processors/subscriptionProcessor.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';
import { waitFor } from '../helpers/waitFor.js';

/**
 * Subscription billing.
 *
 * Every test drives the real webhook entrypoint. None of them insert a Booking
 * directly — doing so would skip the trigger, which IS the thing under test.
 *
 * A replica set is used because the confirmed-charge path commits the booking
 * and the schedule advance in one transaction.
 */
describe('Subscription billing', () => {
  let replSet;
  let app;
  let patient;
  let pkg;
  let lab;

  const RZP_SUB_ID = 'sub_TESTMANDATE001';

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDB(replSet.getUri());
    app = createApp();
    process.env.FF_SUBSCRIPTIONS = 'true';
  }, 120000);

  afterAll(async () => {
    delete process.env.FF_SUBSCRIPTIONS;
    await disconnectDB();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    await resetRateLimitStore();
    await Promise.all([
      User.deleteMany({}),
      TestCatalog.deleteMany({}),
      LabCenter.deleteMany({}),
      Booking.deleteMany({}),
      Subscription.deleteMany({}),
    ]);

    patient = await User.create({
      accountHandle: 'sub_patient',
      phone: '9820000001',
      name: 'Subscribing Patient',
      passwordHash: 'hash',
      role: 'patient',
      location: { lat: 30.3165, lng: 78.0322, address: 'Dehradun', source: 'manual' },
    });

    pkg = await TestCatalog.create({
      name: 'Diabetes Care Plan',
      slug: 'diabetes-care-plan-sub',
      category: 'plan',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 599,
      turnaroundHrs: 12,
      description: 'Quarterly HbA1c and sugar panel for ongoing diabetes management.',
      prepInstructions: '10-hour fasting required.',
    });

    lab = await LabCenter.create({
      name: 'Sunrise Diagnostics',
      area: 'Rajpur Road',
      address: '221 Rajpur Road, Dehradun 248001',
      geo: { type: 'Point', coordinates: [78.0583, 30.3456] },
      priceMultiplier: 1.0,
      turnaroundHrs: 8,
      isVerified: true,
      accreditation: { nabl: true, iso: true },
    });
  });

  /** An active subscription with an authorised mandate, as after activation. */
  async function activeSubscription(overrides = {}) {
    return Subscription.create({
      patientId: patient._id,
      packageId: pkg._id,
      labCenterId: lab._id,
      frequencyDays: 90,
      amount: 599,
      mode: 'home',
      collectionAddress: {
        label: 'Home',
        line: '14 Rajpur Road, Dehradun',
        pincode: '248001',
        lat: 30.3456,
        lng: 78.0583,
      },
      nextScheduledDate: new Date(Date.now() + 90 * 86400000),
      status: 'active',
      mandateStatus: 'active',
      razorpaySubscriptionId: RZP_SUB_ID,
      razorpayPlanId: 'plan_TEST001',
      ...overrides,
    });
  }

  function subscriptionEvent(eventType, { subscriptionId = RZP_SUB_ID, status = 'active' } = {}) {
    return {
      event: eventType,
      created_at: Math.floor(Date.now() / 1000),
      payload: { subscription: { entity: { id: subscriptionId, status } } },
    };
  }

  /** Posts a genuinely signed webhook through the real route. */
  async function postWebhook(body, eventId) {
    const raw = JSON.stringify(body);
    const signature = crypto
      .createHmac('sha256', razorpayConfig.webhookSecret)
      .update(raw)
      .digest('hex');

    return request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .send(raw);
  }

  // ── REQUIRED: successful charge → exactly one booking ─────────────────────

  describe('a confirmed charge', () => {
    it('creates exactly one booking and advances the schedule', async () => {
      const subscription = await activeSubscription();
      const scheduleBefore = subscription.nextScheduledDate;

      const result = await processPaymentJob({
        data: { event: subscriptionEvent('subscription.charged'), eventId: 'evt_charge_1' },
      });

      expect(result.status).toBe('charged');

      const bookings = await Booking.find({ subscriptionId: subscription._id });
      expect(bookings).toHaveLength(1);

      const booking = bookings[0];
      // Subscription.packageId stays singular — one package on a cycle — but
      // the booking it produces records it in the list Booking now uses.
      expect(booking.packageIds).toHaveLength(1);
      expect(booking.packageIds[0].toString()).toBe(pkg._id.toString());
      expect(booking.patientId.toString()).toBe(patient._id.toString());
      // The mandate's amount, not a re-priced one.
      expect(booking.amount).toBe(599);
      // The money arrived before the booking existed — that is the ordering.
      expect(booking.paymentStatus).toBe('paid');
      // The address agreed when the mandate was signed.
      expect(booking.collectionAddress.line).toBe('14 Rajpur Road, Dehradun');

      const after = await Subscription.findById(subscription._id);
      expect(after.nextScheduledDate.getTime()).toBeGreaterThan(scheduleBefore.getTime());
      expect(after.lastChargeStatus).toBe('succeeded');
      expect(after.bookingIds.map(String)).toContain(String(booking._id));
    });

    it('creates the booking through the webhook route end to end', async () => {
      const subscription = await activeSubscription();

      const res = await postWebhook(subscriptionEvent('subscription.charged'), 'evt_route_1');
      expect(res.status).toBe(200); // ACK immediately (§3.3)

      // Processing is asynchronous, so poll for the effect.
      const booking = await waitFor(
        () => Booking.findOne({ subscriptionId: subscription._id }),
        { describe: 'the subscription booking' }
      );

      expect(booking.amount).toBe(599);
    });
  });

  // ── REQUIRED: failed charge → zero bookings, schedule unchanged ───────────

  describe('a failed charge', () => {
    it('creates NO booking and leaves the schedule untouched', async () => {
      const subscription = await activeSubscription();
      const scheduleBefore = subscription.nextScheduledDate.getTime();

      const result = await processPaymentJob({
        data: {
          event: {
            event: 'payment.failed',
            created_at: Math.floor(Date.now() / 1000),
            payload: {
              payment: {
                entity: {
                  id: 'pay_FAILED001',
                  subscription_id: RZP_SUB_ID,
                  status: 'failed',
                  error_description: 'insufficient funds',
                },
              },
            },
          },
          eventId: 'evt_fail_1',
        },
      });

      expect(result.status).toBe('charge_failed');
      expect(result.bookingCreated).toBe(false);

      // THE assertion this feature exists to guarantee.
      const bookings = await Booking.find({ subscriptionId: subscription._id });
      expect(bookings).toHaveLength(0);
      expect(await Booking.countDocuments({})).toBe(0);

      const after = await Subscription.findById(subscription._id);
      // A charge that did not happen must not consume a cycle.
      expect(after.nextScheduledDate.getTime()).toBe(scheduleBefore);
      expect(after.lastChargeStatus).toBe('failed');
      expect(after.bookingIds).toHaveLength(0);
    });

    it('creates no booking for a subscription.pending event either', async () => {
      const subscription = await activeSubscription();
      const scheduleBefore = subscription.nextScheduledDate.getTime();

      await processPaymentJob({
        data: { event: subscriptionEvent('subscription.pending', { status: 'pending' }), eventId: 'evt_pending_1' },
      });

      expect(await Booking.countDocuments({ subscriptionId: subscription._id })).toBe(0);
      const after = await Subscription.findById(subscription._id);
      expect(after.nextScheduledDate.getTime()).toBe(scheduleBefore);
    });

    it('does not bill a cancelled subscription even if a charge arrives', async () => {
      // A charge landing after cancellation is a gateway/bank race. Booking it
      // would commit a phlebotomist to a visit nobody is expecting.
      const subscription = await activeSubscription({ status: 'cancelled', cancelledAt: new Date() });

      const result = await processPaymentJob({
        data: { event: subscriptionEvent('subscription.charged'), eventId: 'evt_charge_cancelled' },
      });

      expect(result.status).toBe('cancelled_subscription');
      expect(await Booking.countDocuments({ subscriptionId: subscription._id })).toBe(0);
    });
  });

  // ── REQUIRED: redelivered webhook is idempotent ───────────────────────────

  describe('redelivery', () => {
    it('creates only one booking when the same charge event arrives twice', async () => {
      const subscription = await activeSubscription();

      const event = subscriptionEvent('subscription.charged');
      const first = await processPaymentJob({ data: { event, eventId: 'evt_dup_1' } });
      const second = await processPaymentJob({ data: { event, eventId: 'evt_dup_1' } });

      expect(first.status).toBe('charged');
      expect(second.status).toBe('duplicate');

      // Razorpay legitimately redelivers; a second booking would mean a second
      // phlebotomist visit for one payment.
      expect(await Booking.countDocuments({ subscriptionId: subscription._id })).toBe(1);

      const after = await Subscription.findById(subscription._id);
      expect(after.bookingIds).toHaveLength(1);
    });

    it('advances the schedule only once across a redelivery', async () => {
      const subscription = await activeSubscription();
      const event = subscriptionEvent('subscription.charged');

      await processPaymentJob({ data: { event, eventId: 'evt_dup_2' } });
      const afterFirst = await Subscription.findById(subscription._id);

      await processPaymentJob({ data: { event, eventId: 'evt_dup_2' } });
      const afterSecond = await Subscription.findById(subscription._id);

      expect(afterSecond.nextScheduledDate.getTime()).toBe(afterFirst.nextScheduledDate.getTime());
    });

    it('survives two concurrent deliveries of the same event', async () => {
      const subscription = await activeSubscription();
      const event = subscriptionEvent('subscription.charged');

      // Promise.all, or the race never actually happens (CONTEXT §10).
      const results = await Promise.all([
        processPaymentJob({ data: { event, eventId: 'evt_race_1' } }),
        processPaymentJob({ data: { event, eventId: 'evt_race_1' } }),
      ]);

      const charged = results.filter((r) => r.status === 'charged');
      expect(charged).toHaveLength(1);
      expect(await Booking.countDocuments({ subscriptionId: subscription._id })).toBe(1);
    });
  });

  // ── REQUIRED: pre-debit notification fires on schedule ────────────────────

  describe('RBI pre-debit notification', () => {
    it('notifies for a charge inside the notice window', async () => {
      // Due in 30 hours: inside the 48h sweep window, beyond the 24h floor.
      const subscription = await activeSubscription({
        nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000),
      });

      const result = await processSubscriptionSweepJob();

      expect(result.notified).toBe(1);

      const after = await Subscription.findById(subscription._id);
      // Recorded, because this is a compliance artifact rather than a nicety.
      expect(after.preDebitNotifiedFor.getTime()).toBe(subscription.nextScheduledDate.getTime());
      expect(after.preDebitNotifiedAt).toBeTruthy();
    });

    it('does not notify for a charge far in the future', async () => {
      await activeSubscription({ nextScheduledDate: new Date(Date.now() + 40 * 86400000) });

      const result = await processSubscriptionSweepJob();

      expect(result.notified).toBe(0);
    });

    it('notifies only once per cycle across repeated sweeps', async () => {
      const subscription = await activeSubscription({
        nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000),
      });

      const first = await processSubscriptionSweepJob();
      const second = await processSubscriptionSweepJob();
      const third = await processSubscriptionSweepJob();

      expect(first.notified).toBe(1);
      // Sending a debit notice twice misstates the compliance record.
      expect(second.notified).toBe(0);
      expect(third.notified).toBe(0);

      const after = await Subscription.findById(subscription._id);
      expect(after.preDebitNotifiedFor.getTime()).toBe(subscription.nextScheduledDate.getTime());
    });

    it('notifies again for the NEXT cycle after a charge succeeds', async () => {
      const subscription = await activeSubscription({
        nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000),
      });

      expect((await processSubscriptionSweepJob()).notified).toBe(1);

      // Charge lands; the schedule moves on.
      await processPaymentJob({
        data: { event: subscriptionEvent('subscription.charged'), eventId: 'evt_cycle_2' },
      });

      const afterCharge = await Subscription.findById(subscription._id);
      // The flag is cleared so the new cycle gets its own notice.
      expect(afterCharge.preDebitNotifiedFor).toBeNull();

      // Move the new cycle into the window and sweep again.
      await Subscription.updateOne(
        { _id: subscription._id },
        { $set: { nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000) } }
      );

      expect((await processSubscriptionSweepJob()).notified).toBe(1);
    });

    it('does not notify a paused or cancelled subscription', async () => {
      await activeSubscription({
        status: 'paused',
        nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000),
      });
      await activeSubscription({
        status: 'cancelled',
        razorpaySubscriptionId: 'sub_OTHER',
        nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000),
      });

      const result = await processSubscriptionSweepJob();

      // Notifying about a debit that will not happen is its own compliance
      // problem, and alarming to the patient.
      expect(result.notified).toBe(0);
    });

    it('still notifies, but flags it, when the notice is shorter than the RBI minimum', async () => {
      // A sweep that was late or skipped leaves a cycle charging in under 24h.
      // Skipping it would mean a debit with NO notice, which is worse; the
      // shortfall has to be visible instead of silently absorbed.
      await activeSubscription({ nextScheduledDate: new Date(Date.now() + 6 * 3600 * 1000) });

      const result = await processSubscriptionSweepJob();

      expect(result.notified).toBe(1);
      expect(result.shortNotice).toBe(1);
    });

    it('does not flag a notice that meets the minimum', async () => {
      await activeSubscription({ nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000) });

      const result = await processSubscriptionSweepJob();

      expect(result.notified).toBe(1);
      expect(result.shortNotice).toBe(0);
    });

    it('never creates a booking, whatever it finds', async () => {
      await activeSubscription({ nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000) });

      await processSubscriptionSweepJob();

      // The sweep schedules and notifies. Only a confirmed charge books.
      expect(await Booking.countDocuments({})).toBe(0);
    });
  });

  // ── Mandate changes made outside the app ─────────────────────────────────

  describe('mandate revoked outside the app', () => {
    it('stops scheduling when the bank cancels the mandate', async () => {
      const subscription = await activeSubscription();

      await processPaymentJob({
        data: {
          event: subscriptionEvent('subscription.cancelled', { status: 'cancelled' }),
          eventId: 'evt_mandate_cancel',
        },
      });

      const after = await Subscription.findById(subscription._id);
      expect(after.status).toBe('cancelled');
      expect(after.mandateStatus).toBe('cancelled');
      expect(after.cancelledAt).toBeTruthy();
    });

    it('marks a halted mandate and stops billing it', async () => {
      const subscription = await activeSubscription();

      await processPaymentJob({
        data: {
          event: subscriptionEvent('subscription.halted', { status: 'halted' }),
          eventId: 'evt_mandate_halt',
        },
      });

      const after = await Subscription.findById(subscription._id);
      expect(after.status).toBe('halted');

      // A halted subscription is not swept for notices.
      await Subscription.updateOne(
        { _id: subscription._id },
        { $set: { nextScheduledDate: new Date(Date.now() + 30 * 3600 * 1000) } }
      );
      expect((await processSubscriptionSweepJob()).notified).toBe(0);
    });

    it('activates on the mandate being authorised', async () => {
      const subscription = await activeSubscription({
        status: 'pending_authorization',
        mandateStatus: 'created',
      });

      await processPaymentJob({
        data: { event: subscriptionEvent('subscription.activated'), eventId: 'evt_mandate_active' },
      });

      const after = await Subscription.findById(subscription._id);
      expect(after.status).toBe('active');
      expect(after.mandateStatus).toBe('active');
    });
  });
});

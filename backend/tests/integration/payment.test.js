import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Booking from '../../src/schemas/Booking.js';
import Payment from '../../src/schemas/Payment.js';
import Rider from '../../src/schemas/Rider.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import razorpayConfig from '../../src/config/razorpayConfig.js';
import { razorpayClient } from '../../src/utils/razorpayClient.js';

describe('Payment & Webhook Integration Tests', () => {
  let mongoServer;
  let app;
  let patient;
  let patientToken;
  let rider;
  let riderToken;
  let sampleLab;
  let cbcTest;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_payment_test' } });
      const uri = mongoServer.getUri();
      await connectDB(uri);
    } catch {
      await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/pathcare_payment_test');
    }

    app = createApp();
  });

  afterAll(async () => {
    await Payment.deleteMany({});
    await Booking.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Payment.deleteMany({});
    await Booking.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});

    patient = await User.create({
      accountHandle: 'patient_pay',
      phone: '9876543220',
      name: 'Patient Pay',
      passwordHash: 'hash_123',
      role: 'patient',
      location: { lat: 30.3165, lng: 78.0322, address: 'Rajpur Road, Dehradun', source: 'manual' },
    });
    patientToken = generateAccessToken({ userId: patient._id.toString(), accountHandle: patient.accountHandle, role: 'patient' });

    rider = await User.create({
      accountHandle: 'rider_pay',
      phone: '9876543221',
      name: 'Rider Pay',
      passwordHash: 'hash_456',
      role: 'rider',
      location: { lat: 30.3165, lng: 78.0322, address: 'Ballupur, Dehradun', source: 'manual' },
    });
    riderToken = generateAccessToken({ userId: rider._id.toString(), accountHandle: rider.accountHandle, role: 'rider' });

    sampleLab = await LabCenter.create({
      name: 'Sunrise Diagnostics',
      area: 'Rajpur Road',
      address: '14/2 Rajpur Road, Dehradun',
      geo: { type: 'Point', coordinates: [78.0583, 30.3456] },
      serviceAreaPincodes: ['248001'],
      priceMultiplier: 1.0,
      turnaroundHrs: 6,
      isVerified: true,
    });

    cbcTest = await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: 'complete-blood-count-cbc',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 299,
      turnaroundHrs: 6,
      parametersCount: 24,
      parameters: ['Hemoglobin', 'RBC Count'],
      description: 'Measures blood cells and platelets.',
      prepInstructions: 'No fasting required.',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Poll until `check()` returns truthy, or fail after `timeoutMs`.
   *
   * The webhook ACKs 200 and processes asynchronously, so a fixed sleep is a
   * race: it passed only while an unrelated earlier test happened to be slow
   * enough to warm the BullMQ Redis connection. Polling makes the assertion
   * depend on the effect, not on wall-clock luck.
   */
  async function waitFor(check, { timeoutMs = 15000, intervalMs = 25 } = {}) {
    // 5s was still too tight: on a loaded machine the BullMQ round trip can
    // exceed it, and the test then reports a paid booking as unpaid — a
    // frightening-looking failure with nothing actually wrong.
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > deadline) return null;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  // Helper to generate valid HMAC signature over raw body
  function signWebhook(rawBody, secret = razorpayConfig.webhookSecret) {
    return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  }

  describe('Razorpay Order Creation (POST /api/payments/create-order)', () => {
    it('creates order for booking and persists initial Payment record', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'pending',
        idempotencyKey: 'book-pay-001',
      });

      // razorpayClient no longer fabricates an order when the API is unreachable
      // (BLOCKER #12), so the test states the gateway response it expects.
      jest.spyOn(razorpayClient, 'createOrder').mockResolvedValue({
        id: 'order_test_created_1',
        entity: 'order',
        amount: 29900,
        currency: 'INR',
        status: 'created',
      });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ bookingId: booking._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBeDefined();
      expect(res.body.data.amount).toBe(29900); // in paise (299 * 100)

      const paymentRecord = await Payment.findOne({ gatewayOrderId: res.body.data.orderId });
      expect(paymentRecord).toBeDefined();
      expect(paymentRecord.amount).toBe(299);
      expect(paymentRecord.status).toBe('created');
    });
  });

  describe('Razorpay Webhook (POST /api/webhooks/razorpay)', () => {
    it('Checkpoint: Invalid/forged signature yields HTTP 400 and makes no database state changes', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'pending',
        idempotencyKey: 'book-forged-test',
      });

      const orderId = 'order_forged_123';
      await Payment.create({
        bookingId: booking._id,
        amount: 299,
        gatewayOrderId: orderId,
        status: 'created',
      });

      const payload = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_forged_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_forged_001',
              order_id: orderId,
              amount: 29900,
              status: 'captured',
            },
          },
        },
      });

      // Send with forged signature
      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'forged_fake_signature_hex_string_that_does_not_match')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.text).toBe('invalid signature');

      // Verify no state change in DB
      const unchangedBooking = await Booking.findById(booking._id);
      expect(unchangedBooking.paymentStatus).toBe('pending');

      const unchangedPayment = await Payment.findOne({ gatewayOrderId: orderId });
      expect(unchangedPayment.status).toBe('created');
    });

    it('Checkpoint: Valid webhook marks booking as paid via raw-body HMAC verification', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'pending',
        idempotencyKey: 'book-valid-webhook',
      });

      const orderId = 'order_valid_123';
      await Payment.create({
        bookingId: booking._id,
        amount: 299,
        gatewayOrderId: orderId,
        status: 'created',
      });

      const eventPayload = {
        event: 'payment.captured',
        id: 'evt_valid_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_valid_001',
              order_id: orderId,
              amount: 29900,
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = signWebhook(rawBody);

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      // Webhook acknowledges 200 immediately
      expect(res.status).toBe(200);
      expect(res.text).toBe('ok');

      // Wait brief moment for async processor
      const updatedBooking = await waitFor(async () => {
        const b = await Booking.findById(booking._id);
        return b.paymentStatus === 'paid' ? b : null;
      });

      expect(updatedBooking).not.toBeNull();
      expect(updatedBooking.paymentStatus).toBe('paid');

      const updatedPayment = await Payment.findOne({ gatewayOrderId: orderId });
      expect(updatedPayment.status).toBe('captured');
      expect(updatedPayment.gatewayPaymentId).toBe('pay_valid_001');
      expect(updatedPayment.webhookEventIds).toContain('evt_valid_001');
    });

    it('Checkpoint: Replay of the SAME webhook event twice results in exactly one payment record and clean deduplication', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'pending',
        idempotencyKey: 'book-dedupe-test',
      });

      const orderId = 'order_dedupe_456';
      await Payment.create({
        bookingId: booking._id,
        amount: 299,
        gatewayOrderId: orderId,
        status: 'created',
      });

      const rawBody = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_duplicate_002',
        payload: {
          payment: {
            entity: {
              id: 'pay_dupe_002',
              order_id: orderId,
              amount: 29900,
              status: 'captured',
            },
          },
        },
      });
      const signature = signWebhook(rawBody);

      // Delivery 1
      const res1 = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);
      expect(res1.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Delivery 2 (duplicate delivery from Razorpay)
      const res2 = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);
      expect(res2.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert exactly one payment record exists and event appears once in webhookEventIds
      const totalPayments = await Payment.countDocuments({ gatewayOrderId: orderId });
      expect(totalPayments).toBe(1);

      const payment = await Payment.findOne({ gatewayOrderId: orderId });
      expect(payment.webhookEventIds.filter((e) => e === 'evt_duplicate_002')).toHaveLength(1);
    });

    it('Closing the client mid-payment still results in a paid booking once the webhook fires', async () => {
      // Patient initiates booking and order, then closes browser without completing frontend callback
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'visit',
        slotDateTime: new Date(),
        status: 'awaiting_confirm',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'pending',
        idempotencyKey: 'book-client-drop-test',
      });

      const orderId = 'order_client_drop_789';
      await Payment.create({
        bookingId: booking._id,
        amount: 299,
        gatewayOrderId: orderId,
        status: 'created',
      });

      // Browser disconnected, but Razorpay webhook delivers successfully
      const rawBody = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_client_drop_999',
        payload: {
          payment: {
            entity: {
              id: 'pay_client_drop_999',
              order_id: orderId,
              amount: 29900,
              status: 'captured',
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signWebhook(rawBody))
        .send(rawBody);

      expect(res.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.paymentStatus).toBe('paid');
    });
  });

  describe('Cash Payment Flow', () => {
    it('Cash booking stays pending until explicitly confirmed by rider or lab admin', async () => {
      // The confirming rider must be the one assigned to this job; cash can only
      // be collected by whoever actually attended the patient.
      const riderDoc = await Rider.create({
        userId: rider._id,
        labCenterId: sampleLab._id,
        currentLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
      });

      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: 'book-cash-confirm-test',
        assignedRiderId: riderDoc._id,
      });

      // Initially paymentStatus is pending
      expect(booking.paymentStatus).toBe('pending');

      // Rider confirms cash collection on doorstep
      const res = await request(app)
        .post(`/api/payments/confirm-cash/${booking._id}`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('paid');

      const paymentRecord = await Payment.findOne({ bookingId: booking._id });
      expect(paymentRecord).toBeDefined();
      expect(paymentRecord.status).toBe('captured');
      expect(paymentRecord.confirmedBy.toString()).toBe(rider._id.toString());
      expect(paymentRecord.confirmedAt).toBeDefined();
    });
  });

  describe('Refund Service (POST /api/payments/cancel/:bookingId)', () => {
    it('Prepaid cancellation refunds amount minus config cancellation fee (₹20)', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: 'book-refund-prepaid',
      });

      await Payment.create({
        bookingId: booking._id,
        amount: 299,
        gatewayOrderId: 'order_refund_1',
        gatewayPaymentId: 'pay_refund_1',
        status: 'captured',
      });

      jest.spyOn(razorpayClient, 'createRefund').mockResolvedValue({
        id: 'rfnd_test_prepaid_1',
        status: 'processed',
      });

      const res = await request(app)
        .post(`/api/payments/cancel/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Need to reschedule' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.paymentStatus).toBe('refunded');
      expect(res.body.data.feeDeducted).toBe(20);
      expect(res.body.data.refundAmount).toBe(279); // 299 - 20

      const updatedPayment = await Payment.findOne({ bookingId: booking._id });
      // ₹279 returned against a ₹299 capture is a PARTIAL refund — ₹20 was
      // retained as the cancellation fee. Labelling it 'full' would misstate
      // how much of the patient's money came back.
      expect(updatedPayment.refundStatus).toBe('partial');
      expect(updatedPayment.refundAmount).toBe(279);
    });

    it('Cash cancellation charges zero fee (charges nothing since no money was collected)', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: 'book-refund-cash',
      });

      const res = await request(app)
        .post(`/api/payments/cancel/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Not feeling well' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.feeDeducted).toBe(0);
      expect(res.body.data.refundAmount).toBe(0);
    });
  });

  // ── BLOCKER #2 regression ────────────────────────────────────────────────
  // POST /api/payments/cancel/:bookingId used to (a) swallow a failed gateway
  // refund and still record refundStatus:'full', and (b) permit cancellation
  // after the specimen was collected. These tests fail against that code.
  describe('BLOCKER #2 — refund state must reflect the gateway, and collected bookings must not cancel', () => {
    async function createPrepaidBooking({
      amount = 299,
      status = 'pending',
      gatewayPaymentId = 'pay_b2_default',
    } = {}) {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status,
        amount,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: `book-b2-${Date.now()}-${Math.random()}`,
      });
      await Payment.create({
        bookingId: booking._id,
        amount,
        gatewayOrderId: `order_b2_${Date.now()}_${Math.random()}`,
        status: 'captured',
        ...(gatewayPaymentId ? { gatewayPaymentId } : {}),
      });
      return booking;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('does NOT record a refund when the gateway call fails', async () => {
      const booking = await createPrepaidBooking({ gatewayPaymentId: 'pay_b2_fail' });

      jest
        .spyOn(razorpayClient, 'createRefund')
        .mockRejectedValue(new Error('Razorpay Refund Failed: payment already refunded'));

      const res = await request(app)
        .post(`/api/payments/cancel/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Need to reschedule' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');

      // The money did not move. Nothing may say it did.
      expect(res.body.data.refundAmount).toBe(0);
      expect(res.body.data.refundStatus).toBe('failed');
      expect(res.body.data.paymentStatus).not.toBe('refunded');

      const storedPayment = await Payment.findOne({ bookingId: booking._id });
      expect(storedPayment.refundStatus).toBe('failed');
      expect(storedPayment.status).not.toBe('refunded');
      expect(storedPayment.refundAmount).toBe(0);

      const storedBooking = await Booking.findById(booking._id);
      expect(storedBooking.paymentStatus).not.toBe('refunded');
    });

    it('refuses to cancel a booking whose specimen has already been collected', async () => {
      const booking = await createPrepaidBooking({ status: 'collected', gatewayPaymentId: 'pay_b2_coll' });

      const spy = jest.spyOn(razorpayClient, 'createRefund');

      const res = await request(app)
        .post(`/api/payments/cancel/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Changed my mind after the blood draw' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_CANCEL');

      // No free test: no refund issued, booking still collected.
      expect(spy).not.toHaveBeenCalled();
      const storedBooking = await Booking.findById(booking._id);
      expect(storedBooking.status).toBe('collected');
    });

    it('does not attempt a refund when no payment was ever captured', async () => {
      const booking = await createPrepaidBooking({ gatewayPaymentId: null });

      const spy = jest.spyOn(razorpayClient, 'createRefund');

      const res = await request(app)
        .post(`/api/payments/cancel/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Never actually paid' });

      expect(res.status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
      expect(res.body.data.refundAmount).toBe(0);
      expect(res.body.data.refundStatus).toBe('failed');

      const storedPayment = await Payment.findOne({ bookingId: booking._id });
      expect(storedPayment.status).not.toBe('refunded');
    });

    it('issues exactly one gateway refund for two concurrent cancellations', async () => {
      const booking = await createPrepaidBooking({ gatewayPaymentId: 'pay_b2_race' });

      const spy = jest
        .spyOn(razorpayClient, 'createRefund')
        .mockResolvedValue({ id: 'rfnd_b2_race', status: 'processed' });

      // Promise.all — sequential awaits would never race (CONTEXT §10).
      const [first, second] = await Promise.all([
        request(app)
          .post(`/api/payments/cancel/${booking._id}`)
          .set('Authorization', `Bearer ${patientToken}`)
          .send({ reason: 'Double tap A' }),
        request(app)
          .post(`/api/payments/cancel/${booking._id}`)
          .set('Authorization', `Bearer ${patientToken}`)
          .send({ reason: 'Double tap B' }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 400]);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('stores the gateway refund id as evidence when the refund succeeds', async () => {
      const booking = await createPrepaidBooking({ gatewayPaymentId: 'pay_b2_ok' });

      jest
        .spyOn(razorpayClient, 'createRefund')
        .mockResolvedValue({ id: 'rfnd_b2_ok', status: 'processed' });

      const res = await request(app)
        .post(`/api/payments/cancel/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Need to reschedule' });

      expect(res.status).toBe(200);
      expect(res.body.data.refundAmount).toBe(279);
      expect(res.body.data.refundStatus).toBe('partial');

      const storedPayment = await Payment.findOne({ bookingId: booking._id });
      expect(storedPayment.gatewayRefundId).toBe('rfnd_b2_ok');
      expect(storedPayment.status).toBe('refunded');
    });
  });
  // -- BLOCKER #8 regression --------------------------------------------------
  // POST /api/payments/confirm-cash/:bookingId gated on hasRole('rider',
  // 'lab_admin','super_admin') and nothing else. paymentService.confirmCashPayment
  // never looked at assignedRiderId or labCenterId, so ANY account with role
  // 'rider' could mark ANY booking paid -- the patient never pays, the assigned
  // rider has no cash to hand in, and the ledger names the wrong collector.
  describe('BLOCKER #8 -- cash confirmation requires entitlement to the booking', () => {
    let assignedRiderDoc;
    let strangerRiderToken;
    let cashBooking;

    beforeEach(async () => {
      assignedRiderDoc = await Rider.create({
        userId: rider._id,
        labCenterId: sampleLab._id,
        currentLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
      });

      // A second, unrelated rider with a valid rider account.
      const strangerRiderUser = await User.create({
        accountHandle: `stranger.rider.${Date.now()}`,
        name: 'Stranger Rider',
        phone: `99${Date.now().toString().slice(-8)}`,
        passwordHash: 'hashed_pw_test',
        role: 'rider',
        location: { lat: 12.97, lng: 77.59, address: 'Bangalore', source: 'manual' },
      });
      await Rider.create({
        userId: strangerRiderUser._id,
        labCenterId: sampleLab._id,
        currentLocation: { type: 'Point', coordinates: [77.59, 12.97] },
      });
      strangerRiderToken = generateAccessToken({
        userId: strangerRiderUser._id.toString(),
        role: 'rider',
      });

      cashBooking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `book-b8-${Date.now()}-${Math.random()}`,
        assignedRiderId: assignedRiderDoc._id,
      });
    });

    it('refuses a rider who is not the assigned rider', async () => {
      const res = await request(app)
        .post(`/api/payments/confirm-cash/${cashBooking._id}`)
        .set('Authorization', `Bearer ${strangerRiderToken}`)
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');

      // The patient's booking is untouched -- no phantom payment.
      const unchanged = await Booking.findById(cashBooking._id);
      expect(unchanged.paymentStatus).toBe('pending');
      const noPayment = await Payment.findOne({ bookingId: cashBooking._id });
      expect(noPayment).toBeNull();
    });

    it('refuses a rider when the booking has no assigned rider at all', async () => {
      const unassigned = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `book-b8-unassigned-${Date.now()}`,
        assignedRiderId: null,
      });

      const res = await request(app)
        .post(`/api/payments/confirm-cash/${unassigned._id}`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send();

      expect(res.status).toBe(404);
      const unchanged = await Booking.findById(unassigned._id);
      expect(unchanged.paymentStatus).toBe('pending');
    });

    it('refuses a lab admin whose centre does not own the booking', async () => {
      const otherCentre = await LabCenter.create({
        name: 'Unrelated Centre B8',
        area: 'Elsewhere',
        address: '2 Elsewhere Road, Bangalore',
        geo: { type: 'Point', coordinates: [77.61, 12.99] },
        priceMultiplier: 1.0,
        turnaroundHrs: 6,
      });
      const foreignAdmin = await User.create({
        accountHandle: `foreign.admin.b8.${Date.now()}`,
        name: 'Foreign Admin',
        phone: `93${Date.now().toString().slice(-8)}`,
        passwordHash: 'hashed_pw_test',
        role: 'lab_admin',
        labCenterId: otherCentre._id,
        location: { lat: 12.97, lng: 77.59, address: 'Bangalore', source: 'manual' },
      });
      const foreignToken = generateAccessToken({
        userId: foreignAdmin._id.toString(),
        role: 'lab_admin',
      });

      const res = await request(app)
        .post(`/api/payments/confirm-cash/${cashBooking._id}`)
        .set('Authorization', `Bearer ${foreignToken}`)
        .send();

      expect(res.status).toBe(404);
      const unchanged = await Booking.findById(cashBooking._id);
      expect(unchanged.paymentStatus).toBe('pending');
    });

    it('refuses a lab admin bound to no centre (fail closed)', async () => {
      const unboundAdmin = await User.create({
        accountHandle: `unbound.admin.b8.${Date.now()}`,
        name: 'Unbound Admin',
        phone: `94${Date.now().toString().slice(-8)}`,
        passwordHash: 'hashed_pw_test',
        role: 'lab_admin',
        location: { lat: 12.97, lng: 77.59, address: 'Bangalore', source: 'manual' },
      });
      const unboundToken = generateAccessToken({
        userId: unboundAdmin._id.toString(),
        role: 'lab_admin',
      });

      const res = await request(app)
        .post(`/api/payments/confirm-cash/${cashBooking._id}`)
        .set('Authorization', `Bearer ${unboundToken}`)
        .send();

      expect(res.status).toBe(404);
      const unchanged = await Booking.findById(cashBooking._id);
      expect(unchanged.paymentStatus).toBe('pending');
    });

    it('allows the ASSIGNED rider and records them as the collector', async () => {
      const res = await request(app)
        .post(`/api/payments/confirm-cash/${cashBooking._id}`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.paymentStatus).toBe('paid');

      const paymentRecord = await Payment.findOne({ bookingId: cashBooking._id });
      expect(paymentRecord.confirmedBy.toString()).toBe(rider._id.toString());
    });
  });
  // -- HIGH H1 regression -----------------------------------------------------
  // The event id was read from req.body.id. A real Razorpay webhook body has no
  // top-level id -- it arrives in the x-razorpay-event-id HEADER -- so eventId
  // was always undefined, webhookEventIds was never populated, and the §3.3
  // dedup guard never fired even once.
  describe('HIGH H1 -- webhook dedup uses the x-razorpay-event-id header', () => {
    async function seedOrder(orderId) {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'pending',
        idempotencyKey: `book-h1-${Date.now()}-${Math.random()}`,
      });
      await Payment.create({
        bookingId: booking._id,
        amount: 299,
        gatewayOrderId: orderId,
        status: 'created',
      });
      return booking;
    }

    // A realistic Razorpay payload: note the ABSENCE of a top-level `id`.
    function realisticBody(orderId, paymentId) {
      return JSON.stringify({
        entity: 'event',
        account_id: 'acc_test',
        event: 'payment.captured',
        contains: ['payment'],
        payload: {
          payment: {
            entity: { id: paymentId, order_id: orderId, amount: 29900, status: 'captured' },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      });
    }

    it('records the header event id on the payment', async () => {
      const orderId = `order_h1_${Date.now()}`;
      const booking = await seedOrder(orderId);
      const rawBody = realisticBody(orderId, 'pay_h1_1');

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signWebhook(rawBody))
        .set('x-razorpay-event-id', 'evt_h1_header_001')
        .send(rawBody);

      expect(res.status).toBe(200);

      const payment = await waitFor(async () => {
        const p = await Payment.findOne({ gatewayOrderId: orderId });
        return p.webhookEventIds.length > 0 ? p : null;
      });

      // Previously: webhookEventIds stayed [] forever.
      expect(payment).not.toBeNull();
      expect(payment.webhookEventIds).toContain('evt_h1_header_001');

      const updated = await Booking.findById(booking._id);
      expect(updated.paymentStatus).toBe('paid');
    });

    it('treats a redelivery of the same event id as a no-op', async () => {
      const orderId = `order_h1_dup_${Date.now()}`;
      await seedOrder(orderId);
      const rawBody = realisticBody(orderId, 'pay_h1_2');
      const signature = signWebhook(rawBody);

      const send = () =>
        request(app)
          .post('/api/webhooks/razorpay')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', signature)
          .set('x-razorpay-event-id', 'evt_h1_repeat_001')
          .send(rawBody);

      await send();
      await waitFor(async () => {
        const p = await Payment.findOne({ gatewayOrderId: orderId });
        return p.webhookEventIds.length > 0 ? p : null;
      });

      // Razorpay legitimately delivers the same event twice.
      await send();
      await new Promise((r) => setTimeout(r, 300));

      const payment = await Payment.findOne({ gatewayOrderId: orderId });
      // Recorded exactly once, not twice.
      expect(payment.webhookEventIds.filter((e) => e === 'evt_h1_repeat_001')).toHaveLength(1);
    });

    it('applies the event exactly once when two deliveries arrive concurrently', async () => {
      const orderId = `order_h1_race_${Date.now()}`;
      await seedOrder(orderId);
      const rawBody = realisticBody(orderId, 'pay_h1_3');
      const signature = signWebhook(rawBody);

      const send = () =>
        request(app)
          .post('/api/webhooks/razorpay')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', signature)
          .set('x-razorpay-event-id', 'evt_h1_race_001')
          .send(rawBody);

      // Promise.all -- sequential awaits would never race (CONTEXT §10).
      await Promise.all([send(), send()]);
      await new Promise((r) => setTimeout(r, 500));

      const payment = await Payment.findOne({ gatewayOrderId: orderId });
      expect(payment.webhookEventIds.filter((e) => e === 'evt_h1_race_001')).toHaveLength(1);
    });

    it('still processes an event that carries no id, and says so', async () => {
      const orderId = `order_h1_noid_${Date.now()}`;
      const booking = await seedOrder(orderId);
      const rawBody = realisticBody(orderId, 'pay_h1_4');

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signWebhook(rawBody))
        .send(rawBody);

      expect(res.status).toBe(200);

      const updated = await waitFor(async () => {
        const b = await Booking.findById(booking._id);
        return b.paymentStatus === 'paid' ? b : null;
      });
      expect(updated).not.toBeNull();
    });
  });
});

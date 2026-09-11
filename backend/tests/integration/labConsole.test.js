// backend/tests/integration/labConsole.test.js
import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import Booking from '../../src/schemas/Booking.js';
import Payment from '../../src/schemas/Payment.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { processAutoCancelJob } from '../../src/processors/autoCancelProcessor.js';
import { razorpayClient } from '../../src/utils/razorpayClient.js';

describe('Lab Centre Operational Console Integration Tests', () => {
  let replSet;
  let app;
  let lab1;
  let lab2;
  let labAdmin1;
  let labAdmin1Token;
  let labAdmin2;
  let labAdmin2Token;
  let patientUser;
  let patientToken;
  let testItem;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    app = createApp();
  }, 60000);

  afterAll(async () => {
    await Booking.deleteMany({});
    await Payment.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  beforeEach(async () => {
    await Promise.all([
      Booking.deleteMany({}),
      Payment.deleteMany({}),
      User.deleteMany({}),
      LabCenter.deleteMany({}),
      TestCatalog.deleteMany({}),
    ]);

    // Create Lab Center 1 (Sunrise Diagnostics)
    lab1 = await LabCenter.create({
      name: 'Sunrise Diagnostics',
      area: 'Rajpur Road',
      address: '12 Rajpur Road, Dehradun',
      geo: { type: 'Point', coordinates: [78.0322, 30.3165] },
      serviceAreaPincodes: ['248001'],
      accreditation: { nabl: true, iso: true },
      priceMultiplier: 1.0,
      turnaroundHrs: 6,
      isVerified: true,
      isOwned: false,
    });

    // Create Lab Center 2 (Doon Imaging & Path)
    lab2 = await LabCenter.create({
      name: 'Doon Imaging & Path',
      area: 'Chakrata Road',
      address: '45 Chakrata Road, Dehradun',
      geo: { type: 'Point', coordinates: [78.01, 30.33] },
      serviceAreaPincodes: ['248002'],
      accreditation: { nabl: true, iso: false },
      priceMultiplier: 1.1,
      turnaroundHrs: 8,
      isVerified: true,
      isOwned: false,
    });

    // Create Test Catalog item
    testItem = await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: `cbc-test-${new mongoose.Types.ObjectId()}`,
      category: 'single',
      description: 'Comprehensive analysis of blood components including RBC, WBC, and platelets.',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 350,
      turnaroundHrs: 6,
      prepInstructions: 'No fasting required',
      parameters: ['Hemoglobin', 'WBC', 'Platelets'],
    });

    // Create Lab Admin 1 (belongs to lab1)
    labAdmin1 = await User.create({
      accountHandle: 'sunrise.admin',
      name: 'Dr. Ramesh Kumar',
      phone: '9876543201',
      passwordHash: 'hashed_pw_test',
      role: 'lab_admin',
      labCenterId: lab1._id,
      location: {
        lat: 30.3165,
        lng: 78.0322,
        address: 'Rajpur Road, Dehradun',
        source: 'manual',
      },
      isVerified: true,
    });
    labAdmin1Token = generateAccessToken(labAdmin1);

    // Create Lab Admin 2 (belongs to lab2)
    labAdmin2 = await User.create({
      accountHandle: 'doon.admin',
      name: 'Dr. Suresh Joshi',
      phone: '9876543202',
      passwordHash: 'hashed_pw_test',
      role: 'lab_admin',
      labCenterId: lab2._id,
      location: {
        lat: 30.33,
        lng: 78.01,
        address: 'Chakrata Road, Dehradun',
        source: 'manual',
      },
      isVerified: true,
    });
    labAdmin2Token = generateAccessToken(labAdmin2);

    // Create Patient
    patientUser = await User.create({
      accountHandle: 'aarav.sharma',
      name: 'Aarav Sharma',
      phone: '9876543203',
      passwordHash: 'hashed_pw_test',
      role: 'patient',
      location: {
        lat: 30.3165,
        lng: 78.0322,
        address: 'Rajpur Road, Dehradun',
        source: 'manual',
      },
      isVerified: true,
    });
    patientToken = generateAccessToken(patientUser);
  });

  describe('Cross-Centre Isolation & Role Gating', () => {
    it('Integration: a lab admin cannot see another centre\'s bookings and gets 404 on unowned resources', async () => {
      // Create 2 bookings for Lab 1
      const lab1Booking1 = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: new Date(),
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      const lab1Booking2 = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: new Date(),
        status: 'confirmed',
        amount: 350,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      // Create 1 booking for Lab 2
      const lab2Booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab2._id,
        mode: 'visit',
        slotDateTime: new Date(),
        status: 'awaiting_confirm',
        amount: 385,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      // 1. Lab Admin 1 queries GET /api/lab/queue
      const queueRes1 = await request(app)
        .get('/api/lab/queue')
        .set('Authorization', `Bearer ${labAdmin1Token}`);

      expect(queueRes1.status).toBe(200);
      expect(queueRes1.body.success).toBe(true);
      expect(queueRes1.body.data.length).toBe(2);

      const returnedIds1 = queueRes1.body.data.map((b) => b._id.toString());
      expect(returnedIds1).toContain(lab1Booking1._id.toString());
      expect(returnedIds1).toContain(lab1Booking2._id.toString());
      // Must NOT contain Lab 2 booking
      expect(returnedIds1).not.toContain(lab2Booking._id.toString());

      // 2. Lab Admin 2 queries GET /api/lab/queue
      const queueRes2 = await request(app)
        .get('/api/lab/queue')
        .set('Authorization', `Bearer ${labAdmin2Token}`);

      expect(queueRes2.status).toBe(200);
      expect(queueRes2.body.data.length).toBe(1);
      expect(queueRes2.body.data[0]._id.toString()).toBe(lab2Booking._id.toString());

      // 3. Lab Admin 1 tries to confirm Lab 2's booking -> returns 404 per CONTEXT §3.2
      const crossConfirmRes = await request(app)
        .patch(`/api/lab/bookings/${lab2Booking._id}/confirm`)
        .set('Authorization', `Bearer ${labAdmin1Token}`);

      expect(crossConfirmRes.status).toBe(404);
      expect(crossConfirmRes.body.error.code).toBe('BOOKING_NOT_FOUND');

      // 4. Lab Admin 1 tries to confirm cash for Lab 2's booking -> returns 404
      const crossCashRes = await request(app)
        .post(`/api/lab/bookings/${lab2Booking._id}/cash-received`)
        .set('Authorization', `Bearer ${labAdmin1Token}`);

      expect(crossCashRes.status).toBe(404);
      expect(crossCashRes.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('rejects unauthorized roles with 403 or 401', async () => {
      // Patient cannot access lab console
      const patientRes = await request(app)
        .get('/api/lab/queue')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(patientRes.status).toBe(403);

      // Unauthenticated request
      const unauthRes = await request(app).get('/api/lab/queue');
      expect(unauthRes.status).toBe(401);
    });
  });

  describe('PATCH /api/lab/bookings/:id/confirm (Confirm Lab-Visit Arrival)', () => {
    it('confirms arrival and transitions status from awaiting_confirm to confirmed', async () => {
      const booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: new Date(),
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      const res = await request(app)
        .patch(`/api/lab/bookings/${booking._id}/confirm`)
        .set('Authorization', `Bearer ${labAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('confirmed');

      const inDb = await Booking.findById(booking._id);
      expect(inDb.status).toBe('confirmed');
    });
  });

  describe('POST /api/lab/bookings/:id/cash-received (Cash Confirmation Audit)', () => {
    it('Integration: cash confirmation records the confirming user', async () => {
      const booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: new Date(),
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      const res = await request(app)
        .post(`/api/lab/bookings/${booking._id}/cash-received`)
        .set('Authorization', `Bearer ${labAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('paid');
      expect(res.body.data.confirmedBy.toString()).toBe(labAdmin1._id.toString());

      // Verify DB booking
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.paymentStatus).toBe('paid');

      // Verify DB payment record has confirmedBy and confirmedAt
      const paymentRecord = await Payment.findOne({ bookingId: booking._id });
      expect(paymentRecord).not.toBeNull();
      expect(paymentRecord.status).toBe('captured');
      expect(paymentRecord.confirmedBy.toString()).toBe(labAdmin1._id.toString());
      expect(paymentRecord.confirmedAt).toBeInstanceOf(Date);
    });
  });

  describe('Auto-Cancel Idempotency & Repeatable Execution', () => {
    it('CHECKPOINT: auto-cancel runs exactly once per booking even if the job runs repeatedly', async () => {
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 8h past slot

      // Create 3 unconfirmed lab-visit bookings that expired past autoCancelAt
      const expiredBooking1 = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: tenHoursAgo,
        autoCancelAt: twoHoursAgo,
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      const expiredBooking2 = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: tenHoursAgo,
        autoCancelAt: twoHoursAgo,
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      const expiredBooking3 = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab2._id,
        mode: 'visit',
        slotDateTime: tenHoursAgo,
        autoCancelAt: twoHoursAgo,
        status: 'awaiting_confirm',
        amount: 385,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      // Also create 1 future booking that should NOT be cancelled
      const futureBooking = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: new Date(Date.now() + 3600000),
        autoCancelAt: new Date(Date.now() + 9 * 3600000),
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idem-${new mongoose.Types.ObjectId()}`,
      });

      // RUN 1: First execution of autoCancel sweep
      const run1 = await processAutoCancelJob({ id: 'test-run-1' });
      expect(run1.candidatesFound).toBe(3);
      expect(run1.cancelledCount).toBe(3);

      // Verify all 3 transitioned to cancelled
      const b1After = await Booking.findById(expiredBooking1._id);
      const b2After = await Booking.findById(expiredBooking2._id);
      const b3After = await Booking.findById(expiredBooking3._id);
      const futureAfter = await Booking.findById(futureBooking._id);

      expect(b1After.status).toBe('cancelled');
      expect(b1After.cancelReason).toContain('Auto-cancelled');
      expect(b2After.status).toBe('cancelled');
      expect(b3After.status).toBe('cancelled');
      expect(futureAfter.status).toBe('awaiting_confirm');

      // RUN 2: Immediate repeated execution (simulating repeatable job trigger or retry)
      const run2 = await processAutoCancelJob({ id: 'test-run-2' });
      expect(run2.candidatesFound).toBe(0);
      expect(run2.cancelledCount).toBe(0);

      // RUN 3: Third execution
      const run3 = await processAutoCancelJob({ id: 'test-run-3' });
      expect(run3.candidatesFound).toBe(0);
      expect(run3.cancelledCount).toBe(0);

      // Re-check DB: counts and statuses remain strictly preserved
      const b1Final = await Booking.findById(expiredBooking1._id);
      expect(b1Final.status).toBe('cancelled');
      const totalCancelled = await Booking.countDocuments({ status: 'cancelled' });
      expect(totalCancelled).toBe(3);
    });
  });

  describe('GET /api/lab/profile', () => {
    it('returns the read-only centre accreditation profile', async () => {
      const res = await request(app)
        .get('/api/lab/profile')
        .set('Authorization', `Bearer ${labAdmin1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Sunrise Diagnostics');
      expect(res.body.data.accreditation.nabl).toBe(true);
      expect(res.body.data.accreditation.iso).toBe(true);
      expect(res.body.data.turnaroundHrs).toBe(6);
    });
  });
  // -- BLOCKER #10 regression -------------------------------------------------
  // autoCancelProcessor called refundService.processCancellationRefund, a method
  // that does not exist. The TypeError was caught and logged, so every prepaid
  // lab-visit booking auto-cancelled past its window was cancelled and NEVER
  // refunded -- silently, with no retry and no alert. The existing sweep test
  // only used CASH bookings, so the refund branch was never executed.
  describe('BLOCKER #10 -- auto-cancel actually refunds prepaid bookings', () => {
    async function createExpiredPrepaidBooking({ amount = 800, gatewayPaymentId = 'pay_autocancel' } = {}) {
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: tenHoursAgo,
        autoCancelAt: twoHoursAgo,
        status: 'awaiting_confirm',
        amount,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: `idem-b10-${new mongoose.Types.ObjectId()}`,
      });

      await Payment.create({
        bookingId: booking._id,
        amount,
        status: 'captured',
        gatewayOrderId: `order_b10_${new mongoose.Types.ObjectId()}`,
        ...(gatewayPaymentId ? { gatewayPaymentId } : {}),
      });

      return booking;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('issues a real gateway refund when auto-cancelling a paid booking', async () => {
      const booking = await createExpiredPrepaidBooking({ amount: 800 });

      const spy = jest
        .spyOn(razorpayClient, 'createRefund')
        .mockResolvedValue({ id: 'rfnd_autocancel_1', status: 'processed' });

      const result = await processAutoCancelJob({ id: 'job-b10-1' });

      expect(result.cancelledCount).toBeGreaterThanOrEqual(1);

      // The defect: this call never happened -- the method did not exist.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'pay_autocancel',
          amountPaise: 78000, // (800 - 20) * 100
        })
      );

      const cancelled = await Booking.findById(booking._id);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.paymentStatus).toBe('refunded');

      const payment = await Payment.findOne({ bookingId: booking._id });
      expect(payment.refundStatus).toBe('partial');
      expect(payment.refundAmount).toBe(780);
      expect(payment.gatewayRefundId).toBe('rfnd_autocancel_1');
    });

    it('records a failed refund honestly instead of claiming success', async () => {
      const booking = await createExpiredPrepaidBooking({ amount: 800 });

      jest
        .spyOn(razorpayClient, 'createRefund')
        .mockRejectedValue(new Error('Razorpay unreachable'));

      const result = await processAutoCancelJob({ id: 'job-b10-2' });

      expect(result.cancelledCount).toBeGreaterThanOrEqual(1);
      expect(result.refundedCount).toBe(0);

      const cancelled = await Booking.findById(booking._id);
      expect(cancelled.status).toBe('cancelled');
      // Money did not move, so nothing may say it did.
      expect(cancelled.paymentStatus).not.toBe('refunded');

      const payment = await Payment.findOne({ bookingId: booking._id });
      expect(payment.refundStatus).toBe('failed');
      expect(payment.status).not.toBe('refunded');
    });

    it('refunds exactly once even if the sweep runs twice', async () => {
      await createExpiredPrepaidBooking({ amount: 800, gatewayPaymentId: 'pay_autocancel_twice' });

      const spy = jest
        .spyOn(razorpayClient, 'createRefund')
        .mockResolvedValue({ id: 'rfnd_autocancel_2', status: 'processed' });

      const first = await processAutoCancelJob({ id: 'job-b10-3a' });
      const second = await processAutoCancelJob({ id: 'job-b10-3b' });

      expect(first.cancelledCount).toBeGreaterThanOrEqual(1);
      expect(second.cancelledCount).toBe(0);

      // The atomic status claim means the patient is refunded once, not twice.
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does not attempt a refund for a cash booking', async () => {
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      await Booking.create({
        patientId: patientUser._id,
        testIds: [testItem._id],
        labCenterId: lab1._id,
        mode: 'visit',
        slotDateTime: tenHoursAgo,
        autoCancelAt: twoHoursAgo,
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idem-b10-cash-${new mongoose.Types.ObjectId()}`,
      });

      const spy = jest.spyOn(razorpayClient, 'createRefund');

      const result = await processAutoCancelJob({ id: 'job-b10-4' });

      expect(result.cancelledCount).toBeGreaterThanOrEqual(1);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

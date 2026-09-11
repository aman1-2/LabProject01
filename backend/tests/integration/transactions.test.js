import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Booking from '../../src/schemas/Booking.js';
import Payment from '../../src/schemas/Payment.js';
import Report from '../../src/schemas/Report.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';
import {
  supportsTransactions,
  resetTransactionSupportCache,
  runInTransaction,
} from '../../src/utils/transactionHelper.js';
import { paymentService } from '../../src/services/paymentService.js';
import { reportService } from '../../src/services/reportService.js';
import { reportRepository } from '../../src/repositories/reportRepository.js';

/**
 * HIGH H3 regression.
 *
 * Six multi-document money/health writes ran with no transaction, so a crash or
 * error between the two writes left the pair disagreeing: a captured payment on
 * a booking still reading 'pending', cash recorded against an unpaid booking, a
 * published report on a booking whose status never moved.
 *
 * Runs on a REPLICA SET so transactions are genuinely available — on a
 * standalone mongod the helper degrades by design and would prove nothing.
 */
describe('Multi-document writes are transactional (HIGH H3)', () => {
  let replSet;
  let app;
  let patient;
  let labCentre;
  let cbcTest;
  let labAdmin;
  let labAdminToken;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDB(replSet.getUri());
    resetTransactionSupportCache();
    app = createApp();
  }, 60000);

  afterAll(async () => {
    await Promise.all([
      Report.deleteMany({}),
      Payment.deleteMany({}),
      Booking.deleteMany({}),
      User.deleteMany({}),
      LabCenter.deleteMany({}),
      TestCatalog.deleteMany({}),
    ]);
    await disconnectDB();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    await resetRateLimitStore();
    await Promise.all([
      Report.deleteMany({}),
      Payment.deleteMany({}),
      Booking.deleteMany({}),
      User.deleteMany({}),
      LabCenter.deleteMany({}),
      TestCatalog.deleteMany({}),
    ]);

    labCentre = await LabCenter.create({
      name: 'Txn Lab',
      area: 'Rajpur Road',
      address: '1 Rajpur Road, Dehradun',
      geo: { type: 'Point', coordinates: [78.0583, 30.3456] },
      priceMultiplier: 1.0,
      turnaroundHrs: 6,
      isVerified: true,
    });

    patient = await User.create({
      accountHandle: 'txn_patient',
      phone: '9800000001',
      name: 'Txn Patient',
      passwordHash: 'hash',
      role: 'patient',
      location: { lat: 30.31, lng: 78.03, address: 'Dehradun', source: 'manual' },
    });

    labAdmin = await User.create({
      accountHandle: 'txn_lab_admin',
      phone: '9800000002',
      name: 'Txn Lab Admin',
      passwordHash: 'hash',
      role: 'lab_admin',
      labCenterId: labCentre._id,
      location: { lat: 30.31, lng: 78.03, address: 'Dehradun', source: 'manual' },
    });
    labAdminToken = generateAccessToken({
      userId: labAdmin._id.toString(),
      role: 'lab_admin',
    });

    cbcTest = await TestCatalog.create({
      name: 'CBC',
      slug: 'cbc-txn',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 299,
      turnaroundHrs: 6,
      description: 'Blood cells.',
      prepInstructions: 'None.',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('capability detection', () => {
    it('detects transaction support without touching driver internals', async () => {
      resetTransactionSupportCache();
      // Uses the documented `hello` command, not
      // connection.client.topology.description.setName (MEDIUM M6).
      expect(await supportsTransactions()).toBe(true);
    });

    it('rolls back every write when the operation throws', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCentre._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'pending',
        idempotencyKey: `txn-rollback-${Date.now()}`,
      });

      await expect(
        runInTransaction(async (session) => {
          await Booking.updateOne(
            { _id: booking._id },
            { $set: { paymentStatus: 'paid' } },
            { session }
          );
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      const after = await Booking.findById(booking._id);
      expect(after.paymentStatus).toBe('pending');
    });
  });

  describe('webhook capture: Payment + Booking commit together', () => {
    it('leaves the booking unpaid if the booking write fails', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCentre._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'pending',
        idempotencyKey: `txn-cap-${Date.now()}`,
      });
      await Payment.create({
        bookingId: booking._id,
        amount: 299,
        gatewayOrderId: 'order_txn_1',
        status: 'created',
      });

      // Fail the SECOND write in the pair.
      jest.spyOn(Booking, 'updateOne').mockRejectedValueOnce(new Error('booking write failed'));

      await expect(
        paymentService.handlePaymentCaptured({
          gatewayOrderId: 'order_txn_1',
          gatewayPaymentId: 'pay_txn_1',
          eventId: 'evt_txn_1',
          amount: 299,
        })
      ).rejects.toThrow();

      // Previously the Payment was already 'captured' while the booking stayed
      // 'pending' — a captured payment nobody had credited.
      const payment = await Payment.findOne({ gatewayOrderId: 'order_txn_1' });
      expect(payment.status).toBe('created');
      expect(payment.webhookEventIds).not.toContain('evt_txn_1');

      const after = await Booking.findById(booking._id);
      expect(after.paymentStatus).toBe('pending');
    });
  });

  describe('cash confirmation: Payment + Booking commit together', () => {
    it('records neither when the booking write fails', async () => {
      const rider = await User.create({
        accountHandle: 'txn_rider',
        phone: '9800000003',
        name: 'Txn Rider',
        passwordHash: 'hash',
        role: 'super_admin', // super_admin short-circuits entitlement
        location: { lat: 30.31, lng: 78.03, address: 'Dehradun', source: 'manual' },
      });

      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCentre._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 299,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `txn-cash-${Date.now()}`,
      });

      jest.spyOn(Booking, 'updateOne').mockRejectedValueOnce(new Error('booking write failed'));

      await expect(
        paymentService.confirmCashPayment({
          bookingId: booking._id.toString(),
          confirmedByUserId: rider._id.toString(),
          actorRole: 'super_admin',
        })
      ).rejects.toThrow();

      // No orphan Payment row claiming cash was collected.
      const payment = await Payment.findOne({ bookingId: booking._id });
      expect(payment).toBeNull();

      const after = await Booking.findById(booking._id);
      expect(after.paymentStatus).toBe('pending');
    });
  });

  describe('report publish: Report + booking transition commit together', () => {
    it('does not leave a published report on a booking whose status never moved', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCentre._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'at_lab',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: `txn-report-${Date.now()}`,
      });

      // Let the Report write succeed, then fail the transition.
      jest
        .spyOn(Booking, 'findOneAndUpdate')
        .mockRejectedValueOnce(new Error('transition failed'));

      await expect(
        reportService.publishReport({
          bookingId: booking._id.toString(),
          labUserId: labAdmin._id.toString(),
          userRole: 'lab_admin',
          pdfKey: `reports/${labCentre._id}/${booking._id}/r.pdf`,
          summaryHtml: '<p>Haemoglobin is normal.</p>',
        })
      ).rejects.toThrow();

      // Previously: Report persisted, booking still 'at_lab' — the record says a
      // report exists while the patient's app shows none.
      const report = await Report.findOne({ bookingId: booking._id });
      expect(report).toBeNull();

      const after = await Booking.findById(booking._id);
      expect(after.status).toBe('at_lab');
    });

    it('commits both on the happy path', async () => {
      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCentre._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'at_lab',
        amount: 299,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: `txn-report-ok-${Date.now()}`,
      });

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCentre._id}/${booking._id}/r.pdf`,
          summaryHtml: '<p>Thyroid values are within limits.</p>',
        });

      expect(res.status).toBe(200);

      const report = await reportRepository.findByBookingId(booking._id);
      expect(report).not.toBeNull();

      const after = await Booking.findById(booking._id);
      expect(after.status).toBe('report_ready');
    });
  });
});

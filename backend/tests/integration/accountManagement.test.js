import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import Address from '../../src/schemas/Address.js';
import Booking from '../../src/schemas/Booking.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Payment from '../../src/schemas/Payment.js';
import Rider from '../../src/schemas/Rider.js';
import { redisGeoHelper } from '../../src/utils/redisGeoHelper.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { BUSINESS_CONFIG } from '../../src/config/businessConfig.js';
import { razorpayClient } from '../../src/utils/razorpayClient.js';

describe('Account Management & Booking Lifecycle Integration Tests', () => {
  let mongoServer;
  let app;
  let userA;
  let userB;
  let tokenA;
  let tokenB;
  let lab;
  let testItem;
  let riderUser;
  let rider;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_acct_test' } });
      const uri = mongoServer.getUri();
      await connectDB(uri);
    } catch {
      await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/pathcare_acct_test');
    }
    app = createApp();
  });

  afterAll(async () => {
    await Address.deleteMany({});
    await Booking.deleteMany({});
    await Payment.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Address.deleteMany({});
    await Booking.deleteMany({});
    await Payment.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});

    userA = await User.create({
      accountHandle: 'usera_acct',
      phone: '9876543210',
      name: 'User Alpha',
      passwordHash: 'test_hash_usera',
      accountType: 'single',
      role: 'patient',
      location: { lat: 12.9716, lng: 77.5946, address: 'Bangalore Central', source: 'manual' },
    });

    userB = await User.create({
      accountHandle: 'userb_acct',
      phone: '9876543211',
      name: 'User Beta',
      passwordHash: 'test_hash_userb',
      accountType: 'single',
      role: 'patient',
      location: { lat: 12.9716, lng: 77.5946, address: 'Bangalore Central', source: 'manual' },
    });

    tokenA = generateAccessToken({
      userId: userA._id.toString(),
      role: userA.role,
      accountHandle: userA.accountHandle,
    });

    tokenB = generateAccessToken({
      userId: userB._id.toString(),
      role: userB.role,
      accountHandle: userB.accountHandle,
    });

    lab = await LabCenter.create({
      name: 'Central Diagnostic Hub',
      address: '100 Feet Rd, Indiranagar',
      area: 'Indiranagar',
      geo: { type: 'Point', coordinates: [77.6408, 12.9784] },
      contactPhone: '9876500000',
      isVerified: true,
      priceMultiplier: 1.0,
      active: true,
    });

    testItem = await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: 'cbc-test-acct',
      category: 'single',
      basePrice: 450,
      turnaroundHrs: 12,
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      description: 'Measures blood cells and hemoglobin.',
      prepInstructions: 'No fasting required.',
      active: true,
    });

    riderUser = await User.create({
      accountHandle: 'rider_acct',
      phone: '9876543299',
      name: 'Phlebo Rider',
      passwordHash: 'rider_hash',
      role: 'rider',
      location: { lat: 12.9716, lng: 77.5946, address: 'Bangalore Hub', source: 'manual' },
    });

    rider = await Rider.create({
      userId: riderUser._id,
      labCenterId: lab._id,
      status: 'assigned',
      currentLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Address Book CRUD & Exactly-One Default Invariant', () => {
    it('starts empty with zero addresses', async () => {
      const res = await request(app)
        .get('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });

    it('automatically marks first address as isDefault: true', async () => {
      const res = await request(app)
        .post('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          label: 'Home',
          line: 'Flat 101, Sunshine Heights',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
          isDefault: false, // even if passed false, first address MUST be default
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isDefault).toBe(true);
      expect(res.body.data.label).toBe('Home');
    });

    it('maintains exactly one default when second address is added with isDefault: true', async () => {
      // First address
      const addr1Res = await request(app)
        .post('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          label: 'Home',
          line: 'Flat 101, Sunshine Heights',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        });

      // Second address with isDefault: true
      const addr2Res = await request(app)
        .post('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          label: 'Work',
          line: 'Tech Park, Whitefield',
          pincode: '560066',
          lat: 12.9698,
          lng: 77.7500,
          isDefault: true,
        });

      expect(addr2Res.status).toBe(201);
      expect(addr2Res.body.data.isDefault).toBe(true);

      // Verify in DB that addr1 is now false and addr2 is true
      const listRes = await request(app)
        .get('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(listRes.status).toBe(200);
      const addresses = listRes.body.data;
      expect(addresses).toHaveLength(2);

      const defaults = addresses.filter((a) => a.isDefault === true);
      expect(defaults).toHaveLength(1);
      expect(defaults[0]._id).toBe(addr2Res.body.data._id);
    });

    it('promotes remaining address to default when default address is deleted', async () => {
      // Add first address
      const addr1Res = await request(app)
        .post('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          label: 'Home',
          line: 'Flat 101',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        });

      // Add second address with isDefault: true
      const addr2Res = await request(app)
        .post('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          label: 'Work',
          line: 'Office Tower 4',
          pincode: '560066',
          lat: 12.9698,
          lng: 77.7500,
          isDefault: true,
        });

      // Delete the default address (addr2)
      const delRes = await request(app)
        .delete(`/api/addresses/${addr2Res.body.data._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(delRes.status).toBe(200);

      // Verify addr1 was promoted to default
      const listRes = await request(app)
        .get('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0]._id).toBe(addr1Res.body.data._id);
      expect(listRes.body.data[0].isDefault).toBe(true);
    });

    it('strictly isolates tenant addresses with 404 on unowned access', async () => {
      const addrRes = await request(app)
        .post('/api/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          label: 'Home',
          line: 'Alpha Private Home',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        });

      const addrId = addrRes.body.data._id;

      // User B attempts to GET User A's address -> 404
      const getRes = await request(app)
        .get(`/api/addresses/${addrId}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(getRes.status).toBe(404);

      // User B attempts to DELETE User A's address -> 404
      const delRes = await request(app)
        .delete(`/api/addresses/${addrId}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(delRes.status).toBe(404);
    });
  });

  describe('2. User Profile (PATCH /api/users/me)', () => {
    it('returns current user profile on GET /api/users/me', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('User Alpha');
      expect(res.body.data.phone).toBe('9876543210');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('updates name and location on PATCH /api/users/me', async () => {
      const res = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Alpha Updated',
          location: {
            lat: 12.9800,
            lng: 77.6000,
            address: 'New Indiranagar Address',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Alpha Updated');
      expect(res.body.data.location.address).toBe('New Indiranagar Address');
    });

    it('rejects duplicate phone number on PATCH /api/users/me with 409', async () => {
      const res = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          phone: userB.phone, // already used by userB
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('PHONE_ALREADY_IN_USE');
    });
  });

  describe('3. Free Booking Reschedule', () => {
    let booking;

    beforeEach(async () => {
      booking = await Booking.create({
        patientId: userA._id,
        testIds: [testItem._id],
        labCenterId: lab._id,
        mode: 'visit',
        slotDateTime: new Date(Date.now() + 24 * 3600 * 1000),
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idemp_resched_${Date.now()}_${Math.random()}`,
        autoCancelAt: new Date(Date.now() + 32 * 3600 * 1000),
      });
    });

    it('reschedules future slot for free and adjusts autoCancelAt for visit mode', async () => {
      const newSlot = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/reschedule`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ slotDateTime: newSlot });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(new Date(res.body.data.slotDateTime).toISOString()).toBe(new Date(newSlot).toISOString());

      // autoCancelAt should be slot + 8 hours
      const expectedAutoCancel = new Date(new Date(newSlot).getTime() + 8 * 3600 * 1000).getTime();
      expect(new Date(res.body.data.autoCancelAt).getTime()).toBe(expectedAutoCancel);
    });

    it('rejects past slot times with 400', async () => {
      const pastSlot = new Date(Date.now() - 3600 * 1000).toISOString();

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/reschedule`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ slotDateTime: pastSlot });

      expect(res.status).toBe(400);
      expect(['INVALID_SLOT_TIME', 'VALIDATION_ERROR']).toContain(
        res.body.error?.code || res.body.code
      );
    });

    it('blocks rescheduling once status reaches collected', async () => {
      booking.status = 'collected';
      await booking.save();

      const futureSlot = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/reschedule`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ slotDateTime: futureSlot });

      expect(res.status).toBe(400);
      expect(res.body.error?.code || res.body.code).toBe('CANNOT_RESCHEDULE_COLLECTED');
    });

    it('returns 404 if user attempts to reschedule an unowned booking', async () => {
      const futureSlot = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/reschedule`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ slotDateTime: futureSlot });

      expect(res.status).toBe(404);
      expect(res.body.error?.code || res.body.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('4. Booking Cancellation, Refunds, & Rider Pool Release', () => {
    it('cancels prepaid booking, deducts ₹20 fee, processes refund and releases rider', async () => {
      // Create prepaid home booking with assigned rider
      const homeBooking = await Booking.create({
        patientId: userA._id,
        testIds: [testItem._id],
        labCenterId: lab._id,
        mode: 'home',
        slotDateTime: new Date(Date.now() + 24 * 3600 * 1000),
        status: 'rider_assigned',
        amount: 500,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        assignedRiderId: rider._id,
        idempotencyKey: `idemp_cancel_prepaid_${Date.now()}`,
      });

      rider.currentBookingId = homeBooking._id;
      await rider.save();

      const payment = await Payment.create({
        bookingId: homeBooking._id,
        amount: 500,
        status: 'captured',
        gatewayOrderId: 'order_test_123',
        // A refund can only be issued against a payment the gateway actually
        // captured. Without this the cancellation must NOT report a refund.
        gatewayPaymentId: 'pay_test_123',
      });

      // The gateway response is stated explicitly; the client no longer
      // fabricates one when Razorpay is unreachable (BLOCKER #12).
      jest.spyOn(razorpayClient, 'createRefund').mockResolvedValue({
        id: 'rfnd_acct_prepaid_1',
        status: 'processed',
      });

      const res = await request(app)
        .patch(`/api/bookings/${homeBooking._id}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Plan changed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.cancellationFee).toBe(BUSINESS_CONFIG.cancellationFee); // 20
      expect(res.body.refundAmount).toBe(480); // 500 - 20 = 480

      // Verify payment record updated
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.refundAmount).toBe(480);
      expect(updatedPayment.status).toBe('refunded');

      // Verify rider released in MongoDB
      const updatedRider = await Rider.findById(rider._id);
      expect(updatedRider.status).toBe('available');
      expect(updatedRider.currentBookingId).toBeNull();

      // Verify rider returned to Redis geo pool
      const nearby = await redisGeoHelper.findNearbyRiders({
        labCenterId: lab._id,
        lat: 12.9716,
        lng: 77.5946,
        radiusKm: 5,
      });
      expect(nearby.some((r) => r.riderId === rider._id.toString())).toBe(true);
    });

    it('cancels cash / pending booking with ₹0 fee and ₹0 refund', async () => {
      const cashBooking = await Booking.create({
        patientId: userA._id,
        testIds: [testItem._id],
        labCenterId: lab._id,
        mode: 'visit',
        slotDateTime: new Date(Date.now() + 24 * 3600 * 1000),
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idemp_cancel_cash_${Date.now()}`,
      });

      const res = await request(app)
        .patch(`/api/bookings/${cashBooking._id}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Found alternative' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.cancellationFee).toBe(0);
      expect(res.body.refundAmount).toBe(0);
    });

    it('strictly blocks cancellation after collected status', async () => {
      const collectedBooking = await Booking.create({
        patientId: userA._id,
        testIds: [testItem._id],
        labCenterId: lab._id,
        mode: 'home',
        slotDateTime: new Date(Date.now() + 24 * 3600 * 1000),
        status: 'collected',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idemp_cancel_coll_${Date.now()}`,
      });

      const res = await request(app)
        .patch(`/api/bookings/${collectedBooking._id}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Want to cancel now' });

      expect(res.status).toBe(400);
      expect(res.body.error?.code || res.body.code).toBe('CANNOT_CANCEL_COLLECTED');
    });

    it('returns 404 if user attempts to cancel unowned booking', async () => {
      const unownedBooking = await Booking.create({
        patientId: userA._id,
        testIds: [testItem._id],
        labCenterId: lab._id,
        mode: 'visit',
        slotDateTime: new Date(Date.now() + 24 * 3600 * 1000),
        status: 'awaiting_confirm',
        amount: 350,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `idemp_cancel_unowned_${Date.now()}`,
      });

      const res = await request(app)
        .patch(`/api/bookings/${unownedBooking._id}/cancel`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ reason: 'Sneaky cancel' });

      expect(res.status).toBe(404);
      expect(res.body.error?.code || res.body.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  // ── BLOCKER #1 regression ──────────────────────────────────────────────────
  // A prepaid cancellation used to stamp payment.status='refunded' and report a
  // refund figure to the patient without ever calling Razorpay. These tests fail
  // against that implementation.
  describe('5. BLOCKER #1 — prepaid cancellation must actually reach the gateway', () => {
    async function createPrepaidBooking({ amount = 500, gatewayPaymentId = 'pay_regress_1' } = {}) {
      const booking = await Booking.create({
        patientId: userA._id,
        testIds: [testItem._id],
        labCenterId: lab._id,
        mode: 'visit',
        slotDateTime: new Date(Date.now() + 24 * 3600 * 1000),
        status: 'awaiting_confirm',
        amount,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: `idemp_b1_${Date.now()}_${Math.random()}`,
      });
      const payment = await Payment.create({
        bookingId: booking._id,
        amount,
        status: 'captured',
        gatewayOrderId: `order_b1_${Date.now()}_${Math.random()}`,
        ...(gatewayPaymentId ? { gatewayPaymentId } : {}),
      });
      return { booking, payment };
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('calls the Razorpay refund API with the captured payment id and the net amount', async () => {
      const { booking } = await createPrepaidBooking({ amount: 500 });

      const spy = jest
        .spyOn(razorpayClient, 'createRefund')
        .mockResolvedValue({ id: 'rfnd_regress_ok', status: 'processed' });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Plan changed' });

      expect(res.status).toBe(200);

      // The defect: this call never happened at all.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'pay_regress_1',
          amountPaise: 48000, // (500 - 20) * 100
        })
      );

      expect(res.body.refundAmount).toBe(480);
      expect(res.body.refundStatus).toBe('partial');

      const storedPayment = await Payment.findOne({ bookingId: booking._id });
      expect(storedPayment.status).toBe('refunded');
      expect(storedPayment.refundStatus).toBe('partial');
      // Evidence the money actually left the gateway.
      expect(storedPayment.gatewayRefundId).toBe('rfnd_regress_ok');
    });

    it('does NOT report a refund when the gateway call fails', async () => {
      const { booking } = await createPrepaidBooking({ amount: 500 });

      jest
        .spyOn(razorpayClient, 'createRefund')
        .mockRejectedValue(new Error('Razorpay Refund Failed: insufficient balance'));

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Plan changed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');

      // The money did not move, so nothing may claim it did.
      expect(res.body.refundAmount).toBe(0);
      expect(res.body.refundStatus).toBe('failed');

      const storedPayment = await Payment.findOne({ bookingId: booking._id });
      expect(storedPayment.status).not.toBe('refunded');
      expect(storedPayment.refundStatus).toBe('failed');
      expect(storedPayment.gatewayRefundId).toBeNull();

      const storedBooking = await Booking.findById(booking._id);
      expect(storedBooking.paymentStatus).not.toBe('refunded');
    });

    it('does not attempt a refund when no payment was ever captured', async () => {
      const { booking } = await createPrepaidBooking({ amount: 500, gatewayPaymentId: null });

      const spy = jest.spyOn(razorpayClient, 'createRefund');

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ reason: 'Plan changed' });

      expect(res.status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
      expect(res.body.refundAmount).toBe(0);
      expect(res.body.refundStatus).toBe('failed');

      const storedPayment = await Payment.findOne({ bookingId: booking._id });
      expect(storedPayment.status).not.toBe('refunded');
    });

    it('issues exactly one gateway refund for two concurrent cancellations', async () => {
      const { booking } = await createPrepaidBooking({ amount: 500, gatewayPaymentId: 'pay_regress_race' });

      const spy = jest
        .spyOn(razorpayClient, 'createRefund')
        .mockResolvedValue({ id: 'rfnd_regress_race', status: 'processed' });

      // Promise.all — sequential awaits would never race (CONTEXT §10).
      const [first, second] = await Promise.all([
        request(app)
          .patch(`/api/bookings/${booking._id}/cancel`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ reason: 'Double tap A' }),
        request(app)
          .patch(`/api/bookings/${booking._id}/cancel`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ reason: 'Double tap B' }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 400]);

      // The patient's money is returned once, not twice.
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});

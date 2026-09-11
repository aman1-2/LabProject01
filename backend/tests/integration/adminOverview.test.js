import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import Doctor from '../../src/schemas/Doctor.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Booking from '../../src/schemas/Booking.js';
import Address from '../../src/schemas/Address.js';
import Rider from '../../src/schemas/Rider.js';
import DailyStats from '../../src/schemas/DailyStats.js';
import Feedback from '../../src/schemas/Feedback.js';
import { rollupDailyStats } from '../../src/services/statsRollupService.js';
import { addRiderLocation, clearGeoStore } from '../../src/utils/redisGeoHelper.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';

describe('Admin Business Overview, Rollup Job, Verification & Feedback Integration', () => {

/**
 * Home collection requires a collection address — the rider has to know where
 * to go. Created through the API with the SAME token as the booking, so the
 * address is owned by the caller and the server's ownership check passes.
 */
async function addressFor(token, lat = 30.3165, lng = 78.0322) {
  const res = await request(app)
    .post('/api/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Home',
      line: '14 Rajpur Road, Dehradun',
      pincode: '248001',
      lat,
      lng,
    });
  return res.body.data._id;
}
  let mongoServer;
  let app;
  let adminUser;
  let adminToken;
  let patientUser;
  let patientToken;
  let verifiedLab;
  let unverifiedLab;
  let cbcTest;
  let glucoseTest;
  let partnerDoc;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_admin_test' } });
      const uri = mongoServer.getUri();
      await connectDB(uri);
    } catch {
      await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/pathcare_admin_test');
    }
    app = createApp();
  });

  afterAll(async () => {
    await DailyStats.deleteMany({});
    await Feedback.deleteMany({});
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await Doctor.deleteMany({});
    await Rider.deleteMany({});
    await clearGeoStore();
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await DailyStats.deleteMany({});
    await Feedback.deleteMany({});
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await Doctor.deleteMany({});
    await Rider.deleteMany({});
    await clearGeoStore();

    // Create Admin User
    adminUser = await User.create({
      accountHandle: 'super_admin_ops',
      phone: '9876543200',
      name: 'Super Admin',
      passwordHash: 'test_hash_admin',
      role: 'super_admin',
      location: { lat: 30.3165, lng: 78.0322, address: 'Rajpur Road, Dehradun', source: 'manual' },
    });
    adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: 'super_admin' });

    // Create Patient User
    patientUser = await User.create({
      accountHandle: 'patient_raj',
      phone: '9876543201',
      name: 'Raj Verma',
      passwordHash: 'test_hash_patient',
      role: 'patient',
      location: { lat: 30.3165, lng: 78.0322, address: 'Clock Tower, Dehradun', source: 'manual' },
    });
    patientToken = generateAccessToken({ userId: patientUser._id.toString(), role: 'patient' });

    // Create Verified Lab Centre
    verifiedLab = await LabCenter.create({
      name: 'PathCare Central Lab',
      area: 'Clock Tower',
      address: '10 Rajpur Road, Dehradun',
      geo: { type: 'Point', coordinates: [78.0322, 30.3165] },
      priceMultiplier: 1.0,
      turnaroundHrs: 6,
      accreditation: { nabl: true, iso: true },
      isVerified: true,
      isActive: true,
    });

    // Create Unverified Lab Centre (isVerified: false)
    unverifiedLab = await LabCenter.create({
      name: 'Unverified Diagnostics',
      area: 'Subhash Nagar',
      address: '45 Haridwar Road, Dehradun',
      geo: { type: 'Point', coordinates: [78.0322, 30.3165] },
      priceMultiplier: 1.0,
      turnaroundHrs: 12,
      accreditation: { nabl: false, iso: false },
      isVerified: false,
      isActive: true,
    });

    // Create Tests
    cbcTest = await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: 'complete-blood-count',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 300,
      turnaroundHrs: 6,
      parametersCount: 24,
      parameters: ['Haemoglobin', 'RBC', 'WBC', 'Platelets'],
      description: 'Full blood profile.',
      prepInstructions: 'No fasting required.',
    });

    glucoseTest = await TestCatalog.create({
      name: 'Fasting Blood Glucose',
      slug: 'fasting-blood-glucose',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 200,
      turnaroundHrs: 4,
      parametersCount: 1,
      parameters: ['Blood Glucose'],
      description: 'Measures blood sugar level.',
      prepInstructions: '10-hour fasting required.',
    });

    // Create Partner Doctor
    partnerDoc = await Doctor.create({
      name: 'Dr. Vivek Bhatt',
      specialization: 'Cardiology',
      clinicName: 'Doon Heart Institute',
      clinicAddress: '15 EC Road, Dehradun',
      tier: 'Gold',
      clinicalFitScore: 95,
      isVerified: false,
      referralCount: 0,
      isActive: true,
    });

    // Seed available riders so home collection succeeds
    for (let i = 1; i <= 3; i++) {
      const riderUser = await User.create({
        accountHandle: `rider_admin_test_${i}`,
        phone: `987654329${i}`,
        name: `Rider ${i}`,
        passwordHash: 'test_hash_rider',
        role: 'rider',
        location: { lat: 30.3165, lng: 78.0322, address: 'Dehradun', source: 'manual' },
      });

      const riderDoc = await Rider.create({
        userId: riderUser._id,
        labCenterId: verifiedLab._id,
        currentLocation: { type: 'Point', coordinates: [78.0322, 30.3165] },
        status: 'available',
        kitId: `KIT-00${i}`,
        trainingCertifiedAt: new Date(),
      });

      await addRiderLocation({
        labCenterId: verifiedLab._id,
        riderId: riderDoc._id,
        lat: 30.3165,
        lng: 78.0322,
      });
    }
  });

  describe('Enforce Lab Centre Verification at API Layer', () => {
    it('rejects booking against an unverified lab centre with HTTP 422 LAB_NOT_VERIFIED', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'key-unverified-lab')
        .send({
            addressId: await addressFor(patientToken),
          testIds: [cbcTest._id.toString()],
          labCenterId: unverifiedLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('LAB_NOT_VERIFIED');
    });

    it('allows booking against a verified lab centre with HTTP 201', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'key-verified-lab')
        .send({
            addressId: await addressFor(patientToken),
          testIds: [cbcTest._id.toString()],
          labCenterId: verifiedLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      const labId = res.body.data.labCenterId?.id || res.body.data.labCenterId?._id || res.body.data.labCenterId;
      expect(labId.toString()).toBe(verifiedLab._id.toString());
    });
  });

  describe('Idempotency of DailyStats Nightly Rollup Job', () => {
    it('re-running rollupDailyStats for a date calculates from source records without double-counting', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Seed 2 bookings for yesterday
      await Booking.create([
        {
          patientId: patientUser._id,
          testIds: [cbcTest._id],
          labCenterId: verifiedLab._id,
          mode: 'home',
          slotDateTime: yesterday,
          status: 'report_ready',
          amount: 300,
          paymentMode: 'upi',
          paymentStatus: 'paid',
          idempotencyKey: 'yesterday-b1',
          createdAt: yesterday,
        },
        {
          patientId: patientUser._id,
          testIds: [glucoseTest._id],
          labCenterId: verifiedLab._id,
          mode: 'visit',
          slotDateTime: yesterday,
          status: 'awaiting_confirm',
          amount: 200,
          paymentMode: 'cash',
          paymentStatus: 'pending',
          idempotencyKey: 'yesterday-b2',
          createdAt: yesterday,
        },
      ]);

      // Run 1: first rollup execution
      const rollup1 = await rollupDailyStats(yesterday);
      expect(rollup1.bookingsCount).toBe(2);
      expect(rollup1.revenue).toBe(300);
      expect(rollup1.revenuePending).toBe(200);
      expect(rollup1.reportsDelivered).toBe(1);
      expect(rollup1.modeSplit.home).toBe(1);
      expect(rollup1.modeSplit.visit).toBe(1);
      expect(rollup1.paymentSplit.upi).toBe(1);
      expect(rollup1.paymentSplit.cash).toBe(1);

      // Run 2: second rollup execution (simulating retry or nightly re-run)
      const rollup2 = await rollupDailyStats(yesterday);

      // Run 3: third rollup execution
      const rollup3 = await rollupDailyStats(yesterday);

      // Verify exactly 1 record in database (no duplicates, no double counting)
      const allDailyStats = await DailyStats.find({});
      expect(allDailyStats).toHaveLength(1);
      expect(allDailyStats[0].bookingsCount).toBe(2);
      expect(allDailyStats[0].revenue).toBe(300);
      expect(allDailyStats[0].revenuePending).toBe(200);
      expect(allDailyStats[0].reportsDelivered).toBe(1);
    });
  });

  describe('CHECKPOINT: Dashboard starts at zero, moves upon 3 real bookings', () => {
    it('shows the dashboard at zero, make three real bookings, show it move', async () => {
      // Step 1: Check dashboard at zero
      const resInitial = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resInitial.status).toBe(200);
      expect(resInitial.body.data.today.bookingsCount).toBe(0);
      expect(resInitial.body.data.today.revenue).toBe(0);
      expect(resInitial.body.data.today.revenuePending).toBe(0);
      expect(resInitial.body.data.today.reportsDelivered).toBe(0);
      expect(resInitial.body.data.today.modeSplit.home).toBe(0);
      expect(resInitial.body.data.today.modeSplit.visit).toBe(0);

      // Step 2: Make Booking 1 (Home collection, ₹300, UPI, Paid)
      const b1 = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: verifiedLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 300,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: 'cp-booking-1',
        createdAt: new Date(),
      });

      // Make Booking 2 (Lab visit, ₹500, Cash, Pending)
      const b2 = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id, glucoseTest._id],
        labCenterId: verifiedLab._id,
        mode: 'visit',
        slotDateTime: new Date(),
        status: 'awaiting_confirm',
        amount: 500,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: 'cp-booking-2',
        createdAt: new Date(),
      });

      // Make Booking 3 (Home collection, ₹1200, UPI, Paid, Report Ready)
      const b3 = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: verifiedLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'report_ready',
        amount: 1200,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: 'cp-booking-3',
        createdAt: new Date(),
      });

      // Step 3: Fetch dashboard again and verify the numbers moved accurately
      const resAfter = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resAfter.status).toBe(200);
      const today = resAfter.body.data.today;

      // Assert movements:
      // Bookings today moved from 0 to 3
      expect(today.bookingsCount).toBe(3);

      // Revenue collected moved from 0 to 1500 (300 + 1200)
      expect(today.revenue).toBe(1500);

      // Payment pending moved from 0 to 500
      expect(today.revenuePending).toBe(500);

      // Reports delivered moved from 0 to 1
      expect(today.reportsDelivered).toBe(1);

      // Mode split: 2 home, 1 visit
      expect(today.modeSplit.home).toBe(2);
      expect(today.modeSplit.visit).toBe(1);

      // Payment split: 2 upi, 1 cash
      expect(today.paymentSplit.upi).toBe(2);
      expect(today.paymentSplit.cash).toBe(1);

      // Per lab volume: verifiedLab has 3 bookings
      const labVol = today.perLabVolumes.find(
        (l) => l.labId.toString() === verifiedLab._id.toString()
      );
      expect(labVol).toBeDefined();
      expect(labVol.count).toBe(3);
    });
  });

  describe('Doctor & Lab Centre Verification Endpoints', () => {
    it('PATCH /api/admin/doctors/:id/verify updates doctor verification status', async () => {
      expect(partnerDoc.isVerified).toBe(false);

      const res = await request(app)
        .patch(`/api/admin/doctors/${partnerDoc._id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isVerified: true });

      expect(res.status).toBe(200);
      expect(res.body.data.isVerified).toBe(true);

      const updated = await Doctor.findById(partnerDoc._id);
      expect(updated.isVerified).toBe(true);
    });

    it('PATCH /api/admin/labs/:id/verify updates lab verification status', async () => {
      expect(unverifiedLab.isVerified).toBe(false);

      const res = await request(app)
        .patch(`/api/admin/labs/${unverifiedLab._id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isVerified: true });

      expect(res.status).toBe(200);
      expect(res.body.data.isVerified).toBe(true);

      const updated = await LabCenter.findById(unverifiedLab._id);
      expect(updated.isVerified).toBe(true);
    });
  });

  describe('Patient Feedback Pipeline', () => {
    it('POST /api/feedback saves patient review with pick-and-drop interest', async () => {
      const booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: verifiedLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'report_ready',
        amount: 300,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: 'fb-booking-1',
      });

      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          bookingId: booking._id.toString(),
          text: 'Phlebotomist arrived promptly on time with cold box intact.',
          pickAndDropInterest: 1,
          rating: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.text).toContain('Phlebotomist arrived promptly');
      expect(res.body.data.pickAndDropInterest).toBe(1);

      // Verify persisted in DB
      const fb = await Feedback.findOne({ bookingId: booking._id });
      expect(fb).toBeDefined();
      expect(fb.pickAndDropInterest).toBe(1);
    });

    it('GET /api/admin/feedback lists patient feedback for admin review', async () => {
      const booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: verifiedLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'report_ready',
        amount: 300,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        idempotencyKey: 'fb-booking-2',
      });

      await Feedback.create({
        bookingId: booking._id,
        userId: patientUser._id,
        text: 'Phlebotomist arrived promptly on time with cold box intact.',
        pickAndDropInterest: 1,
        rating: 5,
      });

      const res = await request(app)
        .get('/api/admin/feedback')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].text).toContain('Phlebotomist arrived promptly');
      expect(res.body.data[0].pickAndDropInterest).toBe(1);
    });
  });

  describe('Admin Console Listing Endpoints (Bookings, Labs, Riders, Doctors)', () => {
    it('GET /api/admin/bookings returns all platform bookings', async () => {
      const res = await request(app)
        .get('/api/admin/bookings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.bookings).toBeDefined();
    });

    it('GET /api/admin/labs returns lab centres with booking volume', async () => {
      const res = await request(app)
        .get('/api/admin/labs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].bookingCount).toBeDefined();
    });

    it('GET /api/admin/riders returns riders list', async () => {
      const res = await request(app)
        .get('/api/admin/riders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
    });

    it('GET /api/admin/doctors returns doctors with tier and referral count', async () => {
      const res = await request(app)
        .get('/api/admin/doctors')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Dr. Vivek Bhatt');
      expect(res.body.data[0].tier).toBe('Gold');
    });
  });
  // -- BLOCKER #7 regression --------------------------------------------------
  // adminRoutes.js applied hasRole('super_admin', 'lab_admin') to the WHOLE
  // router, so every lab admin could read all platform bookings, revenue, the
  // rider and doctor rosters and all feedback -- and could verify their own
  // lab centre, which is the gate bookingService uses to decide bookability.
  describe('BLOCKER #7 -- super admin endpoints are closed to lab admins', () => {
    let labAdminToken;
    let ownCentre;

    beforeEach(async () => {
      ownCentre = await LabCenter.create({
        name: 'Self Serve Diagnostics',
        area: 'Rajpur Road',
        address: '11 Rajpur Road, Dehradun',
        geo: { type: 'Point', coordinates: [78.0583, 30.3456] },
        priceMultiplier: 1.0,
        turnaroundHrs: 6,
        isVerified: false,
      });

      const labAdmin = await User.create({
        accountHandle: `lab.admin.b7.${Date.now()}`,
        name: 'Lab Admin B7',
        phone: `97${Date.now().toString().slice(-8)}`,
        passwordHash: 'hashed_pw_test',
        role: 'lab_admin',
        labCenterId: ownCentre._id,
        location: { lat: 30.3165, lng: 78.0322, address: 'Dehradun', source: 'manual' },
      });
      labAdminToken = generateAccessToken({
        userId: labAdmin._id.toString(),
        role: 'lab_admin',
      });
    });

    const readEndpoints = [
      '/api/admin/overview',
      '/api/admin/bookings',
      '/api/admin/labs',
      '/api/admin/riders',
      '/api/admin/doctors',
      '/api/admin/feedback',
    ];

    it.each(readEndpoints)('refuses a lab admin on GET %s', async (url) => {
      const res = await request(app)
        .get(url)
        .set('Authorization', `Bearer ${labAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });

    it('refuses a lab admin on POST /api/admin/rollup', async () => {
      const res = await request(app)
        .post('/api/admin/rollup')
        .set('Authorization', `Bearer ${labAdminToken}`);

      expect(res.status).toBe(403);
    });

    it('a lab admin CANNOT verify their own lab centre (privilege escalation)', async () => {
      const res = await request(app)
        .patch(`/api/admin/labs/${ownCentre._id}/verify`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({ isVerified: true });

      expect(res.status).toBe(403);

      // The bookability gate is unchanged.
      const unchanged = await LabCenter.findById(ownCentre._id);
      expect(unchanged.isVerified).toBe(false);
    });

    it('a lab admin CANNOT verify a partner doctor', async () => {
      const before = await Doctor.findById(partnerDoc._id);

      const res = await request(app)
        .patch(`/api/admin/doctors/${partnerDoc._id}/verify`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({ isVerified: !before.isVerified });

      expect(res.status).toBe(403);

      const after = await Doctor.findById(partnerDoc._id);
      expect(after.isVerified).toBe(before.isVerified);
    });

    it('a patient is still refused everywhere', async () => {
      const res = await request(app)
        .get('/api/admin/bookings')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });

    it('the super admin retains full access (positive control)', async () => {
      const res = await request(app)
        .get('/api/admin/bookings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('referral leads remain reachable by a lab admin (lab console dependency)', async () => {
      const res = await request(app)
        .get('/api/admin/referral-leads')
        .set('Authorization', `Bearer ${labAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

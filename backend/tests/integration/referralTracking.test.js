import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import Doctor from '../../src/schemas/Doctor.js';
import ExternalReferralMention from '../../src/schemas/ExternalReferralMention.js';
import Booking from '../../src/schemas/Booking.js';
import Address from '../../src/schemas/Address.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Rider from '../../src/schemas/Rider.js';
import { addRiderLocation, clearGeoStore } from '../../src/utils/redisGeoHelper.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';

describe('Doctor Referral Tracking, Atomic Counters & Recruitment Leads Pipeline', () => {

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
  let patientA;
  let tokenA;
  let patientB;
  let tokenB;
  let adminUser;
  let adminToken;
  let partnerDoc;
  let labCenter;
  let cbcTest;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_referral_test' } });
      const uri = mongoServer.getUri();
      await connectDB(uri);
    } catch {
      await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/pathcare_referral_test');
    }
    app = createApp();
  });

  afterAll(async () => {
    await Doctor.deleteMany({});
    await ExternalReferralMention.deleteMany({});
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await Rider.deleteMany({});
    await clearGeoStore();
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Doctor.deleteMany({});
    await ExternalReferralMention.deleteMany({});
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await Rider.deleteMany({});
    await clearGeoStore();

    // Create Patient A
    patientA = await User.create({
      accountHandle: 'patient_alpha',
      phone: '9876543210',
      name: 'Alpha Patient',
      passwordHash: 'test_hash_1',
      role: 'patient',
      location: { lat: 30.3165, lng: 78.0322, address: 'Rajpur Road, Dehradun', source: 'manual' },
    });
    tokenA = generateAccessToken({ userId: patientA._id.toString(), role: 'patient' });

    // Create Patient B
    patientB = await User.create({
      accountHandle: 'patient_beta',
      phone: '9876543211',
      name: 'Beta Patient',
      passwordHash: 'test_hash_2',
      role: 'patient',
      location: { lat: 30.3165, lng: 78.0322, address: 'Ballupur Chowk, Dehradun', source: 'manual' },
    });
    tokenB = generateAccessToken({ userId: patientB._id.toString(), role: 'patient' });

    // Create Admin User
    adminUser = await User.create({
      accountHandle: 'super_admin_1',
      phone: '9876543212',
      name: 'Super Admin',
      passwordHash: 'test_hash_admin',
      role: 'super_admin',
      location: { lat: 30.3165, lng: 78.0322, address: 'Rajpur Road, Dehradun', source: 'manual' },
    });
    adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: 'super_admin' });

    // Create Lab Center
    labCenter = await LabCenter.create({
      name: 'PathCare Central Lab',
      area: 'Clock Tower',
      address: '10 Rajpur Road, Dehradun',
      geo: { type: 'Point', coordinates: [78.0322, 30.3165] },
      priceMultiplier: 1.0,
      turnaroundHrs: 6,
      accreditation: { nabl: true, iso: true },
      cutoffTimes: { morningPickup: '11:00', eveningBatch: '17:00' },
      isActive: true,
      // isVerified now defaults to false (HIGH H18): a centre nobody verified
      // cannot receive bookings. This suite books against it, so it must be
      // explicitly verified.
      isVerified: true,
    });

    // Create Test
    cbcTest = await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: 'complete-blood-count',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 300,
      turnaroundHrs: 6,
      parametersCount: 24,
      parameters: ['Haemoglobin', 'RBC Count', 'WBC Count', 'Platelet Count'],
      description: 'Measures complete blood count parameters.',
      prepInstructions: 'No fasting required.',
    });

    // Create Partner Doctor with initial referralCount = 0
    partnerDoc = await Doctor.create({
      name: 'Dr. Vivek Bhatt',
      specialization: 'Cardiology',
      clinicName: 'Doon Heart Institute',
      clinicAddress: '15 EC Road, Dehradun',
      tier: 'Gold',
      clinicalFitScore: 95,
      referralCount: 0,
      isActive: true,
    });

    // Seed available riders so home collection bookings find a rider
    for (let i = 1; i <= 3; i++) {
      const riderUser = await User.create({
        accountHandle: `rider_ref_${i}`,
        phone: `98765433${i}0`,
        name: `Rider ${i}`,
        passwordHash: 'test_hash_rider',
        role: 'rider',
        location: { lat: 30.3165, lng: 78.0322, address: 'Dehradun', source: 'manual' },
      });

      const riderDoc = await Rider.create({
        userId: riderUser._id,
        labCenterId: labCenter._id,
        currentLocation: { type: 'Point', coordinates: [78.0322, 30.3165] },
        status: 'available',
        kitId: `KIT-00${i}`,
        trainingCertifiedAt: new Date(),
      });

      await addRiderLocation({
        labCenterId: labCenter._id,
        riderId: riderDoc._id,
        lat: 30.3165,
        lng: 78.0322,
      });
    }
  });

  describe('Concurrency Checkpoint: Zero Lost Updates on Doctor referralCount', () => {
    it('concurrent bookings naming the same partner doctor atomically increment referralCount to 2 via Promise.all', async () => {
      // Execute 2 concurrent booking requests simultaneously via Promise.all
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${tokenA}`)
          .set('Idempotency-Key', 'concurrent-booking-1')
          .send({
            addressId: await addressFor(tokenA),
            testIds: [cbcTest._id.toString()],
            labCenterId: labCenter._id.toString(),
            mode: 'home',
            slotDateTime: new Date().toISOString(),
            referralSource: {
              type: 'partner',
              partnerDoctorId: partnerDoc._id.toString(),
            },
          }),
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${tokenB}`)
          .set('Idempotency-Key', 'concurrent-booking-2')
          .send({
            addressId: await addressFor(tokenB),
            testIds: [cbcTest._id.toString()],
            labCenterId: labCenter._id.toString(),
            mode: 'home',
            slotDateTime: new Date().toISOString(),
            referralSource: {
              type: 'partner',
              partnerDoctorId: partnerDoc._id.toString(),
            },
          }),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      // Verify Doctor.referralCount is atomically 2 (no lost updates)
      const updatedDoc = await Doctor.findById(partnerDoc._id);
      expect(updatedDoc.referralCount).toBe(2);

      // Verify bookings recorded partner doctor
      expect(res1.body.data.referralSource.type).toBe('partner');
      const docId1 = res1.body.data.referralSource.partnerDoctorId._id || res1.body.data.referralSource.partnerDoctorId;
      expect(docId1.toString()).toBe(partnerDoc._id.toString());

      expect(res2.body.data.referralSource.type).toBe('partner');
      const docId2 = res2.body.data.referralSource.partnerDoctorId._id || res2.body.data.referralSource.partnerDoctorId;
      expect(docId2.toString()).toBe(partnerDoc._id.toString());
    });
  });

  describe('External Doctor Name Normalisation & Atomic Mention Upsert', () => {
    it('normalises differing variations of doctor names into a single record and increments mentionCount', async () => {
      // First booking: "Dr. A.K. Sharma, MD"
      const res1 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', 'external-booking-1')
        .send({
            addressId: await addressFor(tokenA),
          testIds: [cbcTest._id.toString()],
          labCenterId: labCenter._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          referralSource: {
            type: 'external',
            doctorName: 'Dr. A.K. Sharma, MD',
          },
        });
      expect(res1.status).toBe(201);

      // Second booking: "dr a.k. sharma"
      const res2 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('Idempotency-Key', 'external-booking-2')
        .send({
            addressId: await addressFor(tokenB),
          testIds: [cbcTest._id.toString()],
          labCenterId: labCenter._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          referralSource: {
            type: 'external',
            doctorName: 'dr a.k. sharma',
          },
        });
      expect(res2.status).toBe(201);

      // Third booking: Different doctor "Dr. Priya Mehta, MBBS"
      const res3 = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', 'external-booking-3')
        .send({
            addressId: await addressFor(tokenA),
          testIds: [cbcTest._id.toString()],
          labCenterId: labCenter._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          referralSource: {
            type: 'external',
            doctorName: 'Dr. Priya Mehta, MBBS',
          },
        });
      expect(res3.status).toBe(201);

      // Verify ExternalReferralMention documents in DB
      const mentions = await ExternalReferralMention.find({}).sort({ mentionCount: -1 });
      expect(mentions).toHaveLength(2);

      // Top mention should be Sharma with mentionCount = 2
      expect(mentions[0].normalizedName).toBe('a k sharma');
      expect(mentions[0].mentionCount).toBe(2);
      expect(mentions[0].status).toBe('New');

      // Second mention should be Mehta with mentionCount = 1
      expect(mentions[1].normalizedName).toBe('priya mehta');
      expect(mentions[1].mentionCount).toBe(1);
    });
  });

  describe('Admin Referral Leads Endpoints (GET & PATCH)', () => {
    beforeEach(async () => {
      // Seed external referral mentions
      await ExternalReferralMention.create([
        {
          rawName: 'Dr. A.K. Sharma, MD',
          normalizedName: 'a k sharma',
          mentionCount: 8,
          status: 'New',
          notes: 'Leading general physician in Dalanwala',
          lastMentionedAt: new Date('2026-09-01'),
        },
        {
          rawName: 'Dr. Priya Mehta, MBBS',
          normalizedName: 'priya mehta',
          mentionCount: 4,
          status: 'Contacted',
          notes: 'Reached out to clinic receptionist',
          lastMentionedAt: new Date('2026-09-03'),
        },
        {
          rawName: 'Dr. Rajesh Verma',
          normalizedName: 'rajesh verma',
          mentionCount: 1,
          status: 'Declined',
          notes: 'Not interested at this time',
          lastMentionedAt: new Date('2026-08-15'),
        },
      ]);
    });

    it('GET /api/admin/referral-leads returns ranked list ordered by mentionCount desc', async () => {
      const res = await request(app)
        .get('/api/admin/referral-leads')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      // Highest mentions first
      expect(res.body.data[0].normalizedName).toBe('a k sharma');
      expect(res.body.data[0].mentionCount).toBe(8);
      expect(res.body.data[1].normalizedName).toBe('priya mehta');
      expect(res.body.data[1].mentionCount).toBe(4);
      expect(res.body.data[2].normalizedName).toBe('rajesh verma');
      expect(res.body.data[2].mentionCount).toBe(1);
    });

    it('GET /api/admin/referral-leads filters by status and search', async () => {
      const resStatus = await request(app)
        .get('/api/admin/referral-leads?status=Contacted')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resStatus.status).toBe(200);
      expect(resStatus.body.data).toHaveLength(1);
      expect(resStatus.body.data[0].normalizedName).toBe('priya mehta');

      const resSearch = await request(app)
        .get('/api/admin/referral-leads?search=Sharma')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resSearch.status).toBe(200);
      expect(resSearch.body.data).toHaveLength(1);
      expect(resSearch.body.data[0].normalizedName).toBe('a k sharma');
    });

    it('rejects non-admin users from accessing referral leads (403)', async () => {
      const res = await request(app)
        .get('/api/admin/referral-leads')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/referral-leads/:id updates status and notes', async () => {
      const lead = await ExternalReferralMention.findOne({ normalizedName: 'a k sharma' });

      // Move lead to In discussion and append notes
      const res = await request(app)
        .patch(`/api/admin/referral-leads/${lead._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'In discussion',
          notes: 'Met with Dr. Sharma in clinic. Scheduled onboarding demo for Friday.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('In discussion');
      expect(res.body.data.notes).toContain('Scheduled onboarding demo');

      // Verify persisted in DB
      const updated = await ExternalReferralMention.findById(lead._id);
      expect(updated.status).toBe('In discussion');
      expect(updated.notes).toContain('Scheduled onboarding demo');
    });

    it('PATCH /api/admin/referral-leads/:id validates status enum values', async () => {
      const lead = await ExternalReferralMention.findOne({ normalizedName: 'a k sharma' });

      const res = await request(app)
        .patch(`/api/admin/referral-leads/${lead._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'InvalidStatus',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Doctor Dashboard reflects atomic referralCount', () => {
    it('returns referralCount and patientsReferred in dashboard KPIs', async () => {
      // Create a user account for partner doctor
      const docUser = await User.create({
        accountHandle: 'dr_vivek_bhatt',
        phone: '9876543299',
        name: 'Dr. Vivek Bhatt',
        passwordHash: 'test_hash_doc',
        role: 'doctor',
        location: { lat: 30.3165, lng: 78.0322, address: 'EC Road, Dehradun', source: 'manual' },
      });
      partnerDoc.userId = docUser._id;
      partnerDoc.referralCount = 5;
      await partnerDoc.save();

      const docToken = generateAccessToken({ userId: docUser._id.toString(), role: 'doctor' });

      const res = await request(app)
        .get('/api/doctor/dashboard')
        .set('Authorization', `Bearer ${docToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.doctor.referralCount).toBe(5);
      expect(res.body.data.counts.patientsReferred).toBe(5);
    });
  });
});

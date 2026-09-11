import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Booking from '../../src/schemas/Booking.js';
import Address from '../../src/schemas/Address.js';
import Doctor from '../../src/schemas/Doctor.js';
import Rider from '../../src/schemas/Rider.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { addRiderLocation, clearGeoStore } from '../../src/utils/redisGeoHelper.js';

describe('Booking API Integration Tests', () => {

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
  let patientB;
  let tokenA;
  let tokenB;
  let sampleLab;
  let cbcTest;
  let ultrasoundTest;
  let partnerDoc;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_booking_test' } });
      const uri = mongoServer.getUri();
      await connectDB(uri);
    } catch {
      await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/pathcare_booking_test');
    }

    app = createApp();
  });

  afterAll(async () => {
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await Doctor.deleteMany({});
    await clearGeoStore();
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await Doctor.deleteMany({});
    await clearGeoStore();

    // Create Patient A
    patientA = await User.create({
      accountHandle: 'patient_a',
      phone: '9876543210',
      name: 'Patient A',
      passwordHash: 'test_hash_123',
      role: 'patient',
      location: {
        lat: 30.3165,
        lng: 78.0322,
        address: 'Rajpur Road, Dehradun',
        source: 'manual',
      },
    });
    tokenA = generateAccessToken({ userId: patientA._id.toString(), accountHandle: patientA.accountHandle, role: 'patient' });

    // Create Patient B
    patientB = await User.create({
      accountHandle: 'patient_b',
      phone: '9876543211',
      name: 'Patient B',
      passwordHash: 'test_hash_456',
      role: 'patient',
      location: {
        lat: 30.3165,
        lng: 78.0322,
        address: 'Clock Tower, Dehradun',
        source: 'manual',
      },
    });
    tokenB = generateAccessToken({ userId: patientB._id.toString(), accountHandle: patientB.accountHandle, role: 'patient' });

    // Create Lab Center with priceMultiplier = 0.92
    sampleLab = await LabCenter.create({
      name: 'Doon Path Labs',
      area: 'Ballupur Chowk',
      address: '88 Chakrata Road, Dehradun',
      geo: {
        type: 'Point',
        coordinates: [78.0125, 30.334],
      },
      serviceAreaPincodes: ['248001'],
      priceMultiplier: 0.92,
      turnaroundHrs: 8,
      isVerified: true,
    });

    // Create Blood Test (Home collection available, basePrice = 299)
    cbcTest = await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: 'complete-blood-count-cbc',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 299,
      turnaroundHrs: 6,
      parametersCount: 24,
      parameters: ['Hemoglobin', 'RBC Count', 'WBC Count'],
      description: 'Measures red cells, white cells, haemoglobin and platelets.',
      prepInstructions: 'No fasting required.',
    });

    // Create Imaging Test (Home collection NOT available, basePrice = 1200)
    ultrasoundTest = await TestCatalog.create({
      name: 'Ultrasound — Whole Abdomen',
      slug: 'ultrasound-whole-abdomen',
      category: 'imaging',
      sampleType: 'Imaging',
      homeCollectionAvailable: false,
      basePrice: 1200,
      turnaroundHrs: 4,
      parametersCount: 0,
      parameters: ['Liver', 'Gallbladder'],
      description: 'Ultrasound imaging of the abdominal organs.',
      prepInstructions: '6-hour fasting required.',
    });

    // Create Partner Doctor
    partnerDoc = await Doctor.create({
      name: 'Dr. Sanjay Sharma',
      specialization: 'Internal Medicine',
      clinicName: 'Doon Clinic',
      isActive: true,
    });

    // Seed a pool of available riders for sampleLab so home collection bookings find available riders
    for (let i = 1; i <= 5; i++) {
      const riderUser = await User.create({
        accountHandle: `rider_booking_test_${i}`,
        phone: `987654329${i}`,
        name: `Rider Booking Test ${i}`,
        passwordHash: 'test_hash_rider',
        role: 'rider',
        location: {
          lat: 30.334,
          lng: 78.0125,
          address: 'Clock Tower, Dehradun',
          source: 'manual',
        },
      });

      const riderDoc = await Rider.create({
        userId: riderUser._id,
        labCenterId: sampleLab._id,
        currentLocation: {
          type: 'Point',
          coordinates: [78.0125, 30.334],
        },
        status: 'available',
        kitId: `KIT-DEHRADUN-0${i}`,
        trainingCertifiedAt: new Date(),
      });

      await addRiderLocation({
        labCenterId: sampleLab._id,
        riderId: riderDoc._id,
        lat: 30.334,
        lng: 78.0125,
      });
    }
  });

  describe('POST /api/bookings', () => {
    it('returns 400 when Idempotency-Key header is missing', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
            addressId: await addressFor(tokenA),
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });

    it('Checkpoint 1: Computes price strictly server-side, ignoring client-supplied amount', async () => {
      const idempotencyKey = 'key-pricing-check-001';
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
            addressId: await addressFor(tokenA),
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          amount: 5, // Client attempts to supply fraudulent amount ₹5
        });

      expect(res.status).toBe(201);
      // Math.round(299 * 0.92) = 275.08 -> 275
      expect(res.body.data.amount).toBe(275);
      expect(res.body.data.amount).not.toBe(5);

      const dbBooking = await Booking.findById(res.body.data._id);
      expect(dbBooking.amount).toBe(275);
    });

    it('Checkpoint 2: Replays original response for identical Idempotency-Key without creating duplicate booking', async () => {
      const idempotencyKey = 'key-replay-check-002';
      const payload = {
        addressId: await addressFor(tokenA),
        testIds: [cbcTest._id.toString()],
        labCenterId: sampleLab._id.toString(),
        mode: 'home',
        slotDateTime: new Date().toISOString(),
      };

      // First call
      const firstRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(firstRes.status).toBe(201);
      expect(firstRes.body.isReplay).toBe(false);
      const bookingId = firstRes.body.data._id;

      // Second call with same idempotency key
      const secondRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.isReplay).toBe(true);
      expect(secondRes.body.data._id).toBe(bookingId);

      // Verify DB has only 1 booking
      const totalBookings = await Booking.countDocuments({ idempotencyKey });
      expect(totalBookings).toBe(1);
    });

    it('rejects home collection for imaging tests with 422 HOME_COLLECTION_UNAVAILABLE', async () => {
      const idempotencyKey = 'key-imaging-check-003';
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
            addressId: await addressFor(tokenA),
          testIds: [ultrasoundTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home', // Home collection requested for imaging
          slotDateTime: new Date().toISOString(),
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('HOME_COLLECTION_UNAVAILABLE');
    });

    it('sets status to awaiting_confirm and autoCancelAt to slot + 8h for lab visit bookings', async () => {
      const idempotencyKey = 'key-visit-check-004';
      const slotTime = new Date('2026-10-15T10:00:00.000Z');

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          testIds: [ultrasoundTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'visit',
          slotDateTime: slotTime.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('awaiting_confirm');
      expect(res.body.data.mode).toBe('visit');

      // autoCancelAt = slot + 8h = 2026-10-15T18:00:00.000Z
      const expectedAutoCancel = new Date(slotTime.getTime() + 8 * 60 * 60 * 1000).toISOString();
      expect(new Date(res.body.data.autoCancelAt).toISOString()).toBe(expectedAutoCancel);
    });

    it('sets status to pending and autoCancelAt to null for home collection bookings', async () => {
      const idempotencyKey = 'key-home-check-005';
      const slotTime = new Date('2026-10-15T10:00:00.000Z');

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
            addressId: await addressFor(tokenA),
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: slotTime.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(['pending', 'rider_assigned']).toContain(res.body.data.status);
      expect(res.body.data.mode).toBe('home');
      expect(res.body.data.autoCancelAt).toBeNull();
    });

    it('captures referral sources accurately: partner, external, and none', async () => {
      // 1. Partner doctor
      const resPartner = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', 'key-referral-partner')
        .send({
            addressId: await addressFor(tokenA),
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          referralSource: {
            type: 'partner',
            partnerDoctorId: partnerDoc._id.toString(),
          },
        });
      expect(resPartner.status).toBe(201);
      expect(resPartner.body.data.referralSource.type).toBe('partner');

      // 2. External doctor
      const resExternal = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', 'key-referral-external')
        .send({
            addressId: await addressFor(tokenA),
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          referralSource: {
            type: 'external',
            externalText: 'Dr. R. K. Verma, Max Hospital',
          },
        });
      expect(resExternal.status).toBe(201);
      expect(resExternal.body.data.referralSource.type).toBe('external');
      expect(resExternal.body.data.referralSource.externalText).toBe('Dr. R. K. Verma, Max Hospital');

      // 3. None
      const resNone = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', 'key-referral-none')
        .send({
            addressId: await addressFor(tokenA),
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
        });
      expect(resNone.status).toBe(201);
      expect(resNone.body.data.referralSource.type).toBe('none');
    });
  });

  describe('GET /api/bookings and GET /api/bookings/:id', () => {
    it('returns caller own bookings in reverse chronological order', async () => {
      await Booking.create({
        patientId: patientA._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date('2026-10-01'),
        status: 'pending',
        amount: 275,
        idempotencyKey: 'booking-past',
        createdAt: new Date('2026-10-01'),
      });

      await Booking.create({
        patientId: patientA._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date('2026-10-02'),
        status: 'pending',
        amount: 275,
        idempotencyKey: 'booking-newer',
        createdAt: new Date('2026-10-02'),
      });

      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].idempotencyKey).toBe('booking-newer');
      expect(res.body.data[1].idempotencyKey).toBe('booking-past');
    });

    it('Checkpoint 3: Returns 404 (NOT 403) on unowned records per CONTEXT §3.2', async () => {
      // Create a booking owned by Patient A
      const bookingA = await Booking.create({
        patientId: patientA._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 275,
        idempotencyKey: 'owned-by-patient-a',
      });

      // Patient B tries to access Patient A's booking
      const res = await request(app)
        .get(`/api/bookings/${bookingA._id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      // Must strictly return 404, never 403
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('returns 200 when owner accesses their own booking', async () => {
      const bookingA = await Booking.create({
        patientId: patientA._id,
        testIds: [cbcTest._id],
        labCenterId: sampleLab._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 275,
        idempotencyKey: 'owned-by-a-self',
      });

      const res = await request(app)
        .get(`/api/bookings/${bookingA._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id.toString()).toBe(bookingA._id.toString());
      expect(res.body.data.amount).toBe(275);
    });
  });
  // -- Collection address (rider app prerequisite) ----------------------------
  // Home collection previously carried no address at all: Booking had no such
  // field, so a rider had no way to know where to go and dispatch fell back to
  // hardcoded Bangalore coordinates on a Dehradun-only launch (§2.5).
  describe('Collection address for home bookings', () => {
    it('rejects a home booking with no addressId', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', `addr-missing-${Date.now()}`)
        .send({
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an address belonging to someone else with 404, not 403', async () => {
      // Owned by user B; user A must not be able to book against it, and must
      // not learn that it exists (CONTEXT §3.2).
      const foreignAddressId = await addressFor(tokenB);

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', `addr-foreign-${Date.now()}`)
        .send({
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          addressId: foreignAddressId,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ADDRESS_NOT_FOUND');
    });

    it('SNAPSHOTS the address onto the booking rather than referencing it', async () => {
      const addressId = await addressFor(tokenA);

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', `addr-snap-${Date.now()}`)
        .send({
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          addressId,
        });

      expect(res.status).toBe(201);

      const booking = await Booking.findById(res.body.data._id);
      expect(booking.collectionAddress.line).toBe('14 Rajpur Road, Dehradun');
      expect(booking.collectionAddress.pincode).toBe('248001');
      expect(booking.collectionAddress.lat).toBeCloseTo(30.3165, 3);
      expect(booking.collectionAddress.addressId.toString()).toBe(addressId);

      // Deleting the source address must NOT change where the rider is sent.
      await request(app)
        .delete(`/api/addresses/${addressId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      const after = await Booking.findById(res.body.data._id);
      expect(after.collectionAddress.line).toBe('14 Rajpur Road, Dehradun');
      expect(after.collectionAddress.lat).toBeCloseTo(30.3165, 3);
    });

    it('does not require an address for a lab visit', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', `addr-visit-${Date.now()}`)
        .send({
          testIds: [cbcTest._id.toString()],
          labCenterId: sampleLab._id.toString(),
          mode: 'visit',
          slotDateTime: new Date(Date.now() + 86400000).toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.collectionAddress).toBeFalsy();
    });
  });
});

// backend/tests/integration/riderMatching.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Booking from '../../src/schemas/Booking.js';
import Address from '../../src/schemas/Address.js';
import Rider from '../../src/schemas/Rider.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { addRiderLocation, clearGeoStore, findNearbyRiders } from '../../src/utils/redisGeoHelper.js';
import { opsAlertService } from '../../src/services/opsAlertService.js';
import { getRedisClient } from '../../src/config/redisConfig.js';

describe('Rider Matching & Concurrency Integration Tests (P05)', () => {

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
  let replSet;
  let app;
  let labCenter;
  let cbcTest;

  beforeAll(async () => {
    // Replica set is required for MongoDB ACID transactions
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    app = createApp();
  }, 60000);

  afterAll(async () => {
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  beforeEach(async () => {
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await clearGeoStore();
    opsAlertService.clearAlerts();

    // Seed Lab Center (Central Bangalore: 12.9716, 77.5946)
    labCenter = await LabCenter.create({
      name: 'PathCare Central Lab',
      area: 'Shivajinagar',
      address: '100 Infantry Road, Bangalore',
      geo: {
        type: 'Point',
        coordinates: [77.5946, 12.9716],
      },
      serviceAreaPincodes: ['560001', '560002'],
      accreditation: { nabl: true, iso: true, icmr: true },
      priceMultiplier: 1.0,
      turnaroundHrs: 6,
      isVerified: true,
      isOwned: true,
    });

    // Seed Test Item
    cbcTest = await TestCatalog.create({
      code: 'CBC01',
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

  async function createTestRider({ name = 'Rider A', phone = '9876543210', lat = 12.9720, lng = 77.5950, status = 'available' } = {}) {
    const uniqueSuffix = Math.random().toString(36).substring(2, 7);
    const user = await User.create({
      accountHandle: `rider_${uniqueSuffix}`,
      phone,
      name,
      role: 'rider',
      passwordHash: 'hash_rider',
      location: {
        lat,
        lng,
        address: 'MG Road, Bangalore',
        source: 'manual',
      },
    });

    const rider = await Rider.create({
      userId: user._id,
      labCenterId: labCenter._id,
      currentLocation: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      status,
      kitId: `KIT-${uniqueSuffix.toUpperCase()}`,
      trainingCertifiedAt: new Date(),
    });

    if (status === 'available') {
      await addRiderLocation({
        labCenterId: labCenter._id,
        riderId: rider._id,
        lat,
        lng,
      });
    }

    const token = generateAccessToken({
      userId: user._id.toString(),
      accountHandle: user.accountHandle,
      role: 'rider',
    });

    return { user, rider, token };
  }

  async function createTestPatient({ name = 'Patient Test', phone = '9900112233', lat = 12.9716, lng = 77.5946 } = {}) {
    const uniqueSuffix = Math.random().toString(36).substring(2, 7);
    const patient = await User.create({
      accountHandle: `patient_${uniqueSuffix}`,
      phone,
      name,
      role: 'patient',
      passwordHash: 'hash_patient',
      location: {
        lat,
        lng,
        address: 'Brigade Road, Bangalore',
        source: 'manual',
      },
    });

    const token = generateAccessToken({
      userId: patient._id.toString(),
      accountHandle: patient.accountHandle,
      role: 'patient',
    });

    return { patient, token };
  }

  describe('Rider Allocation & Concurrency Guarantees', () => {
    it('Integration: TWO CONCURRENT bookings for the last available rider (Promise.all race condition test)', async () => {
      // 1 available rider
      const { rider: soloRider } = await createTestRider({
        name: 'Last Available Phlebotomist',
        phone: '9888888888',
        lat: 12.9730,
        lng: 77.5960,
      });

      // 2 distinct patients
      const { token: token1 } = await createTestPatient({ name: 'Concurrent Patient 1', phone: '9111111111' });
      const { token: token2 } = await createTestPatient({ name: 'Concurrent Patient 2', phone: '9222222222' });

      const runId = Date.now();

      // Fire BOTH bookings simultaneously with Promise.all
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${token1}`)
          .set('Idempotency-Key', `book-concurrency-1-${runId}`)
          .send({
            addressId: await addressFor(token1, 12.9716, 77.5946),
            testIds: [cbcTest._id.toString()],
            labCenterId: labCenter._id.toString(),
            mode: 'home',
            slotDateTime: new Date().toISOString(),
            lat: 12.9716,
            lng: 77.5946,
          }),
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${token2}`)
          .set('Idempotency-Key', `book-concurrency-2-${runId}`)
          .send({
            addressId: await addressFor(token2, 12.9716, 77.5946),
            testIds: [cbcTest._id.toString()],
            labCenterId: labCenter._id.toString(),
            mode: 'home',
            slotDateTime: new Date().toISOString(),
            lat: 12.9716,
            lng: 77.5946,
          }),
      ]);

      const statuses = [res1.status, res2.status];

      // Assert EXACTLY ONE booking got the rider (201) and the other fell through cleanly (422)
      expect(statuses).toContain(201);
      expect(statuses).toContain(422);

      const successRes = res1.status === 201 ? res1 : res2;
      const failedRes = res1.status === 422 ? res1 : res2;

      expect(successRes.body.success).toBe(true);
      expect(successRes.body.data.status).toBe('rider_assigned');
      expect(successRes.body.data.assignedRiderId._id || successRes.body.data.assignedRiderId).toBe(soloRider._id.toString());

      expect(failedRes.body.success).toBe(false);
      expect(failedRes.body.error.code).toBe('NO_RIDERS_AVAILABLE');

      // Assert database integrity: exactly ONE booking exists in Mongo
      const totalBookings = await Booking.countDocuments({});
      expect(totalBookings).toBe(1);

      // Assert rider status in DB is assigned and points to the winning booking
      const updatedRider = await Rider.findById(soloRider._id);
      expect(updatedRider.status).toBe('assigned');
      expect(updatedRider.currentBookingId.toString()).toBe(successRes.body.data._id);
    });

    it('Integration: the transaction rolls back fully if the claim fails entirely', async () => {
      // Zero riders available in the area
      const { token: patientToken } = await createTestPatient({ name: 'Unassigned Patient' });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', `book-rollback-${Date.now()}`)
        .send({
            addressId: await addressFor(patientToken, 12.9716, 77.5946),
          testIds: [cbcTest._id.toString()],
          labCenterId: labCenter._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          lat: 12.9716,
          lng: 77.5946,
        });

      // Expect failure
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('NO_RIDERS_AVAILABLE');

      // CRITICAL: Assert transaction rolled back fully — ZERO bookings in Mongo!
      const bookingCount = await Booking.countDocuments({});
      expect(bookingCount).toBe(0);

      // Assert alert was surfaced to ops console
      const alerts = opsAlertService.getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].type).toBe('UNASSIGNED_RIDER');
    });

    it('Integration: radius expands when no rider is in the initial radius (5km -> 10km)', async () => {
      // Place rider at ~8km away (outside initial 5km radius, within 10km)
      // Bangalore (12.9716, 77.5946) to (13.0400, 77.6200) is ~8.0 km
      const { rider: distantRider } = await createTestRider({
        name: 'Distant Rider',
        phone: '9877777777',
        lat: 13.0400,
        lng: 77.6200,
      });

      const { token: patientToken } = await createTestPatient({ name: 'Patient Requesting Home' });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', `book-expand-${Date.now()}`)
        .send({
            addressId: await addressFor(patientToken, 12.9716, 77.5946),
          testIds: [cbcTest._id.toString()],
          labCenterId: labCenter._id.toString(),
          mode: 'home',
          slotDateTime: new Date().toISOString(),
          lat: 12.9716,
          lng: 77.5946,
        });

      // Booking must succeed after radius expansion
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('rider_assigned');
      expect(res.body.data.assignedRiderId._id || res.body.data.assignedRiderId).toBe(distantRider._id.toString());
    });
  });

  describe('Rider Endpoints (Location, Jobs, Atomic Accept, Status)', () => {
    it('PATCH /api/rider/location: updates Redis, NOT written to Mongo, and is throttled to 1 per 10s', async () => {
      const initialLat = 12.9720;
      const initialLng = 77.5950;
      const { rider, token: riderToken } = await createTestRider({
        lat: initialLat,
        lng: initialLng,
      });

      const updatedLat = 12.9800;
      const updatedLng = 77.6000;

      // 1. First location ping
      const res1 = await request(app)
        .patch('/api/rider/location')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ lat: updatedLat, lng: updatedLng });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      // CRITICAL: Verify location was NOT written to Mongo
      const dbRider = await Rider.findById(rider._id);
      expect(dbRider.currentLocation.coordinates).toEqual([initialLng, initialLat]);

      // Verify location IS in Redis geo helper
      const candidates = await findNearbyRiders({
        labCenterId: labCenter._id,
        lat: updatedLat,
        lng: updatedLng,
        radiusKm: 1,
      });
      expect(candidates.some((c) => c.riderId === rider._id.toString())).toBe(true);

      // 2. Second ping immediately within 10 seconds -> Throttled (429)
      const res2 = await request(app)
        .patch('/api/rider/location')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ lat: updatedLat + 0.001, lng: updatedLng + 0.001 });

      expect(res2.status).toBe(429);
      expect(res2.body.error.code).toBe('LOCATION_UPDATE_THROTTLED');
    });

    it('GET /api/rider/jobs & PATCH /api/rider/jobs/:id/accept: atomic accept returns 409 if already taken', async () => {
      const { rider: rider1, token: rider1Token } = await createTestRider({ name: 'Rider 1', phone: '9777777771' });
      const { token: rider2Token } = await createTestRider({ name: 'Rider 2', phone: '9777777772' });
      const { patient } = await createTestPatient();

      // Create a pending unassigned booking directly
      const pendingBooking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 300,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `job-test-${Date.now()}`,
      });

      // Rider 1 accepts job
      const acceptRes1 = await request(app)
        .patch(`/api/rider/jobs/${pendingBooking._id}/accept`)
        .set('Authorization', `Bearer ${rider1Token}`);

      expect(acceptRes1.status).toBe(200);
      expect(acceptRes1.body.data.booking.status).toBe('rider_assigned');

      // Rider 2 attempts to accept the SAME job -> 409 Conflict
      const acceptRes2 = await request(app)
        .patch(`/api/rider/jobs/${pendingBooking._id}/accept`)
        .set('Authorization', `Bearer ${rider2Token}`);

      expect(acceptRes2.status).toBe(409);
      expect(acceptRes2.body.error.code).toBe('JOB_ALREADY_TAKEN');

      // Rider 1 checks active job
      const jobsRes = await request(app)
        .get('/api/rider/jobs')
        .set('Authorization', `Bearer ${rider1Token}`);

      expect(jobsRes.status).toBe(200);
      expect(jobsRes.body.data.activeJob._id).toBe(pendingBooking._id.toString());
    });

    it('PATCH /api/rider/status: updates status and removes from geo search when offline', async () => {
      const { rider, token } = await createTestRider();

      // Set offline
      const resOffline = await request(app)
        .patch('/api/rider/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'offline' });

      expect(resOffline.status).toBe(200);
      expect(resOffline.body.data.status).toBe('offline');

      // Verify removed from geo search
      const candidates = await findNearbyRiders({
        labCenterId: labCenter._id,
        lat: 12.9720,
        lng: 77.5950,
        radiusKm: 5,
      });
      expect(candidates.some((c) => c.riderId === rider._id.toString())).toBe(false);
    });
  });

  describe('CHECKPOINT: 20 Sequential Concurrency Runs', () => {
    it('runs the concurrency race condition test 20 times in a row without a single failure', async () => {
      for (let i = 1; i <= 20; i++) {
        // Clear state before each iteration
        await Booking.deleteMany({});
    await Address.deleteMany({});
        await Rider.deleteMany({});
        await User.deleteMany({});
        await clearGeoStore();

        // 1 solitary available rider
        const { rider } = await createTestRider({
          name: `Solo Rider Run ${i}`,
          phone: `99900000${i < 10 ? '0' + i : i}`,
          lat: 12.9720,
          lng: 77.5950,
        });

        // 2 distinct patients
        const { token: t1 } = await createTestPatient({ name: `Patient 1 Run ${i}`, phone: `91100000${i < 10 ? '0' + i : i}` });
        const { token: t2 } = await createTestPatient({ name: `Patient 2 Run ${i}`, phone: `92200000${i < 10 ? '0' + i : i}` });

        const [resA, resB] = await Promise.all([
          request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${t1}`)
            .set('Idempotency-Key', `checkpoint-run-${i}-reqA`)
            .send({
            addressId: await addressFor(t1, 12.9716, 77.5946),
              testIds: [cbcTest._id.toString()],
              labCenterId: labCenter._id.toString(),
              mode: 'home',
              slotDateTime: new Date().toISOString(),
              lat: 12.9716,
              lng: 77.5946,
            }),
          request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${t2}`)
            .set('Idempotency-Key', `checkpoint-run-${i}-reqB`)
            .send({
            addressId: await addressFor(t2, 12.9716, 77.5946),
              testIds: [cbcTest._id.toString()],
              labCenterId: labCenter._id.toString(),
              mode: 'home',
              slotDateTime: new Date().toISOString(),
              lat: 12.9716,
              lng: 77.5946,
            }),
        ]);

        const statuses = [resA.status, resB.status];

        // Fail early if race condition occurred
        if (!statuses.includes(201) || !statuses.includes(422)) {
          throw new Error(
            `Checkpoint Run #${i} failed: statuses were [${statuses.join(', ')}]. Exactly one must be 201 and one 422.`
          );
        }

        const count = await Booking.countDocuments({});
        if (count !== 1) {
          throw new Error(
            `Checkpoint Run #${i} failed: total bookings in DB is ${count}, expected exactly 1.`
          );
        }
      }
    }, 60000); // 60s timeout for 20 concurrent runs
  });
  // -- HIGH H5 regression -----------------------------------------------------
  // acceptJob read the rider, checked for an existing job, claimed the BOOKING
  // atomically, then saved the rider. Two concurrent accepts by the SAME rider
  // both passed the check and each claimed a different booking; the last save
  // won. One rider ended up assigned to two jobs, and one booking pointed at a
  // rider whose currentBookingId was elsewhere -- an orphan no sweep will find.
  describe('HIGH H5 -- a rider cannot claim two jobs concurrently', () => {
    async function pendingBookingFor(patient, key) {
      return Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 300,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `h5-${key}-${Date.now()}-${Math.random()}`,
      });
    }

    it('claims exactly one of two jobs accepted concurrently by the same rider', async () => {
      const { rider, token } = await createTestRider({ name: 'H5 Rider', phone: '9788888881' });
      const { patient } = await createTestPatient({ name: 'H5 Patient', phone: '9788888882' });

      const jobA = await pendingBookingFor(patient, 'a');
      const jobB = await pendingBookingFor(patient, 'b');

      // Promise.all -- sequential awaits would never race (CONTEXT §10).
      const [resA, resB] = await Promise.all([
        request(app)
          .patch(`/api/rider/jobs/${jobA._id}/accept`)
          .set('Authorization', `Bearer ${token}`),
        request(app)
          .patch(`/api/rider/jobs/${jobB._id}/accept`)
          .set('Authorization', `Bearer ${token}`),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 400]);

      // The rider holds exactly one job.
      const finalRider = await Rider.findById(rider._id);
      expect(finalRider.status).toBe('assigned');
      expect(finalRider.currentBookingId).not.toBeNull();

      // And no booking is left assigned to a rider who is not tracking it.
      const assigned = await Booking.find({ assignedRiderId: rider._id });
      expect(assigned).toHaveLength(1);
      expect(assigned[0]._id.toString()).toBe(finalRider.currentBookingId.toString());
    });

    it('leaves no orphaned booking pointing at a rider working elsewhere', async () => {
      const { rider, token } = await createTestRider({ name: 'H5 Rider 2', phone: '9788888883' });
      const { patient } = await createTestPatient({ name: 'H5 Patient 2', phone: '9788888884' });

      const jobs = await Promise.all([
        pendingBookingFor(patient, 'c'),
        pendingBookingFor(patient, 'd'),
        pendingBookingFor(patient, 'e'),
      ]);

      await Promise.all(
        jobs.map((j) =>
          request(app)
            .patch(`/api/rider/jobs/${j._id}/accept`)
            .set('Authorization', `Bearer ${token}`)
        )
      );

      const finalRider = await Rider.findById(rider._id);
      const assigned = await Booking.find({ assignedRiderId: rider._id });

      // Previously: up to 3 bookings claimed, currentBookingId naming only one.
      expect(assigned).toHaveLength(1);
      expect(assigned[0]._id.toString()).toBe(finalRider.currentBookingId.toString());
    });

    it('releases the rider when the job was taken by someone else', async () => {
      const { rider: riderOne, token: tokenOne } = await createTestRider({ name: 'H5 R1', phone: '9788888885' });
      const { rider: riderTwo, token: tokenTwo } = await createTestRider({ name: 'H5 R2', phone: '9788888886' });
      const { patient } = await createTestPatient({ name: 'H5 Patient 3', phone: '9788888887' });

      const job = await pendingBookingFor(patient, 'f');

      const first = await request(app)
        .patch(`/api/rider/jobs/${job._id}/accept`)
        .set('Authorization', `Bearer ${tokenOne}`);
      expect(first.status).toBe(200);

      const second = await request(app)
        .patch(`/api/rider/jobs/${job._id}/accept`)
        .set('Authorization', `Bearer ${tokenTwo}`);
      expect(second.status).toBe(409);

      // The losing rider must go back in the pool, not be stranded as assigned.
      const loser = await Rider.findById(riderTwo._id);
      expect(loser.status).toBe('available');
      expect(loser.currentBookingId).toBeNull();

      const winner = await Rider.findById(riderOne._id);
      expect(winner.status).toBe('assigned');
    });
  });
  // -- HIGH H16 / H18 regression ----------------------------------------------
  describe('HIGH H16 -- the rider job board carries no patient identity', () => {
    it('does not expose patient name or phone on unclaimed jobs', async () => {
      const { token } = await createTestRider({ name: 'Board Rider', phone: '9766666661' });
      const { patient } = await createTestPatient({ name: 'Private Patient', phone: '9766666662' });

      await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 300,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `h16-${Date.now()}`,
      });

      const res = await request(app)
        .get('/api/rider/jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.availableJobs.length).toBeGreaterThan(0);

      // Previously every rider at the centre saw the name and phone number of
      // every patient with a pending booking, claimed or not.
      const serialised = JSON.stringify(res.body.data.availableJobs);
      expect(serialised).not.toContain('Private Patient');
      expect(serialised).not.toContain('9766666662');
    });

    it('still returns what a rider needs to decide on a job', async () => {
      const { token } = await createTestRider({ name: 'Board Rider 2', phone: '9766666663' });
      const { patient } = await createTestPatient({ name: 'Another Patient', phone: '9766666664' });

      await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 450,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `h16b-${Date.now()}`,
      });

      const res = await request(app)
        .get('/api/rider/jobs')
        .set('Authorization', `Bearer ${token}`);

      const job = res.body.data.availableJobs[0];
      expect(job._id).toBeDefined();
      expect(job.slotDateTime).toBeDefined();
      expect(job.amount).toBe(450);
      expect(job.testIds[0].name).toBeDefined();
    });

    it('reveals patient contact details once the job is claimed', async () => {
      const { token } = await createTestRider({ name: 'Board Rider 3', phone: '9766666665' });
      const { patient } = await createTestPatient({ name: 'Claimed Patient', phone: '9766666666' });

      const booking = await Booking.create({
        patientId: patient._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        slotDateTime: new Date(),
        status: 'pending',
        amount: 300,
        paymentMode: 'cash',
        paymentStatus: 'pending',
        idempotencyKey: `h16c-${Date.now()}`,
      });

      await request(app)
        .patch(`/api/rider/jobs/${booking._id}/accept`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .get('/api/rider/jobs')
        .set('Authorization', `Bearer ${token}`);

      // The assigned rider needs the patient's details to actually attend.
      expect(res.body.data.activeJob.patientId.name).toBe('Claimed Patient');
      expect(res.body.data.activeJob.patientId.phone).toBe('9766666666');
    });
  });

  describe('HIGH H18 -- lab centres are unverified until someone verifies them', () => {
    it('a newly created centre is not verified by default', async () => {
      const fresh = await LabCenter.create({
        name: 'Brand New Centre',
        area: 'Somewhere',
        address: '1 New Road, Dehradun',
        geo: { type: 'Point', coordinates: [78.03, 30.31] },
        priceMultiplier: 1.0,
        turnaroundHrs: 6,
      });

      // Previously defaulted to true, making it immediately bookable.
      expect(fresh.isVerified).toBe(false);
    });

    it('rejects a booking against a centre that was never verified', async () => {
      const { token: patientToken } = await createTestPatient({
        name: 'H18 Patient',
        phone: '9755555551',
      });

      const unverified = await LabCenter.create({
        name: 'Unverified Centre',
        area: 'Somewhere',
        address: '2 New Road, Dehradun',
        geo: { type: 'Point', coordinates: [78.03, 30.31] },
        priceMultiplier: 1.0,
        turnaroundHrs: 6,
      });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', `h18-${Date.now()}`)
        .send({
          testIds: [cbcTest._id.toString()],
          labCenterId: unverified._id.toString(),
          mode: 'visit',
          slotDateTime: new Date(Date.now() + 86400000).toISOString(),
          paymentMode: 'cash',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('LAB_NOT_VERIFIED');
    });
  });
});

// backend/tests/integration/sampleTracking.test.js
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
import Sample from '../../src/schemas/Sample.js';
import Payment from '../../src/schemas/Payment.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { generateDeterministicBarcode, isValidBarcodeFormat } from '../../src/utils/barcodeGenerator.js';
import { addRiderLocation, clearGeoStore } from '../../src/utils/redisGeoHelper.js';

describe('Physical-Sample Tracking Layer Integration Tests', () => {

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
  let patientUser;
  let patientToken;
  let otherPatientUser;
  let otherPatientToken;
  let riderUser;
  let riderProfile;
  let riderToken;
  let otherRiderUser;
  let otherRiderProfile;
  let otherRiderToken;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    app = createApp();
  }, 60000);

  afterAll(async () => {
    await Sample.deleteMany({});
    await Payment.deleteMany({});
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
    await Sample.deleteMany({});
    await Payment.deleteMany({});
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});

    // Seed Lab Center
    labCenter = await LabCenter.create({
      name: 'Doon Central Pathology Lab',
      area: 'Rajpur Road',
      address: '12 Rajpur Road, Dehradun',
      geo: {
        type: 'Point',
        coordinates: [78.0322, 30.3165],
      },
      serviceAreaPincodes: ['248001', '248002'],
      priceMultiplier: 1.0,
      turnaroundHrs: 6,
      isVerified: true,
      accreditation: {
        nabl: true,
        iso: true,
        icmr: true,
      },
    });

    // Seed Test Catalog
    cbcTest = await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: 'complete-blood-count-cbc',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 350,
      turnaroundHrs: 6,
      prepInstructions: 'No fasting required',
      description: 'Comprehensive screening test evaluating red cells, white cells, and platelets.',
    });


    // Seed Patient 1
    patientUser = await User.create({
      accountHandle: 'aarav.sharma',
      name: 'Aarav Sharma',
      phone: '9876543210',
      passwordHash: 'hashed_pw_test',
      role: 'patient',
      accountType: 'single',
      location: {
        lat: 30.3165,
        lng: 78.0322,
        address: 'Rajpur Road, Dehradun',
        source: 'manual',
      },
      isVerified: true,
    });
    patientToken = generateAccessToken(patientUser);

    // Seed Patient 2 (for unowned testing)
    otherPatientUser = await User.create({
      accountHandle: 'priya.singh',
      name: 'Priya Singh',
      phone: '9876543211',
      passwordHash: 'hashed_pw_test',
      role: 'patient',
      accountType: 'single',
      location: {
        lat: 30.32,
        lng: 78.04,
        address: 'Clock Tower, Dehradun',
        source: 'manual',
      },
      isVerified: true,
    });
    otherPatientToken = generateAccessToken(otherPatientUser);

    // Seed Rider 1
    riderUser = await User.create({
      accountHandle: 'vikram.rider',
      name: 'Vikram Phlebotomist',
      phone: '9876543220',
      passwordHash: 'hashed_pw_test',
      role: 'rider',
      accountType: 'single',
      location: {
        lat: 30.3165,
        lng: 78.0322,
        address: 'Rajpur Road, Dehradun',
        source: 'geo',
      },
      isVerified: true,
    });
    riderProfile = await Rider.create({
      userId: riderUser._id,
      labCenterId: labCenter._id,
      status: 'assigned',
      currentLocation: {
        type: 'Point',
        coordinates: [78.0322, 30.3165],
      },
      trainingCertifiedAt: new Date(),
    });
    riderToken = generateAccessToken(riderUser);

    // Seed Rider 2 (for unowned testing)
    otherRiderUser = await User.create({
      accountHandle: 'amit.rider',
      name: 'Amit Phlebotomist',
      phone: '9876543221',
      passwordHash: 'hashed_pw_test',
      role: 'rider',
      accountType: 'single',
      location: {
        lat: 30.32,
        lng: 78.04,
        address: 'Jakhan, Dehradun',
        source: 'geo',
      },
      isVerified: true,
    });
    otherRiderProfile = await Rider.create({
      userId: otherRiderUser._id,
      labCenterId: labCenter._id,
      status: 'available',
      currentLocation: {
        type: 'Point',
        coordinates: [78.04, 30.32],
      },
      trainingCertifiedAt: new Date(),
    });
    otherRiderToken = generateAccessToken(otherRiderUser);
  });

  // Helper to create an en_route home booking assigned to riderProfile
  async function createEnRouteHomeBooking(paymentMode = 'upi') {
    const booking = await Booking.create({
      patientId: patientUser._id,
      testIds: [cbcTest._id],
      labCenterId: labCenter._id,
      mode: 'home',
      slotDateTime: new Date(Date.now() + 3600000),
      status: 'en_route',
      assignedRiderId: riderProfile._id,
      amount: 350,
      paymentMode,
      paymentStatus: paymentMode === 'cash' ? 'pending' : 'paid',
      idempotencyKey: `test-idem-${new mongoose.Types.ObjectId()}`,
    });

    riderProfile.currentBookingId = booking._id;
    riderProfile.status = 'assigned';
    await riderProfile.save();

    return booking;
  }

  describe('POST /api/rider/jobs/:id/collect', () => {
    it('Integration: collect creates a Sample with a unique barcode and records first cold-chain reading', async () => {
      const booking = await createEnRouteHomeBooking();

      const res = await request(app)
        .post(`/api/rider/jobs/${booking._id}/collect`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          temperature: 4.2,
          notes: 'Blood sample collected via vacuum tube into cold box',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sample).toBeDefined();

      const sampleData = res.body.data.sample;
      expect(sampleData.barcode).toBeDefined();
      expect(isValidBarcodeFormat(sampleData.barcode)).toBe(true);
      expect(sampleData.coldChainLog).toHaveLength(1);
      expect(sampleData.coldChainLog[0].temperature).toBe(4.2);
      expect(sampleData.handoffTimestamps.collectedAt).toBeDefined();

      // Verify DB persistence
      const sampleInDb = await Sample.findOne({ bookingId: booking._id });
      expect(sampleInDb).not.toBeNull();
      expect(sampleInDb.barcode).toBe(sampleData.barcode);
      expect(sampleInDb.coldChainLog[0].temperature).toBe(4.2);

      // Verify Booking status transitioned to 'collected' with barcode
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.status).toBe('collected');
      expect(updatedBooking.barcode).toBe(sampleData.barcode);
    });

    it('Integration: barcode collision handled seamlessly via deterministic retry', async () => {
      const booking = await createEnRouteHomeBooking();

      // Pre-calculate what attempt 0 barcode will be and pre-insert it to force collision
      const collidedBarcode = generateDeterministicBarcode(booking._id, { date: new Date(), attempt: 0 });
      const dummyBookingId = new mongoose.Types.ObjectId();
      await Sample.create({
        bookingId: dummyBookingId,
        barcode: collidedBarcode,
        collectedAt: new Date(),
        coldChainLog: [{ temperature: 4.0, recordedAt: new Date(), recordedBy: riderUser._id }],
      });

      // Now collect the actual booking — it should hit collision, retry attempt 1, and succeed!
      const res = await request(app)
        .post(`/api/rider/jobs/${booking._id}/collect`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ temperature: 4.5 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sample.barcode).not.toBe(collidedBarcode);
      expect(isValidBarcodeFormat(res.body.data.sample.barcode)).toBe(true);

      const sampleInDb = await Sample.findOne({ bookingId: booking._id });
      expect(sampleInDb).not.toBeNull();
      expect(sampleInDb.barcode).toBe(res.body.data.sample.barcode);
    });

    it('Ownership test: rejects collection attempt from an unassigned rider with 404', async () => {
      const booking = await createEnRouteHomeBooking();

      // otherRider is NOT assigned to this booking
      const res = await request(app)
        .post(`/api/rider/jobs/${booking._id}/collect`)
        .set('Authorization', `Bearer ${otherRiderToken}`)
        .send({ temperature: 4.0 });

      // CONTEXT §3.2: Return 404, not 403, when resource is not owned by caller
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('POST /api/rider/jobs/:id/cash-received', () => {
    it('Integration: cash confirmation records who and when', async () => {
      const booking = await createEnRouteHomeBooking('cash');

      const res = await request(app)
        .post(`/api/rider/jobs/${booking._id}/cash-received`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('paid');
      expect(res.body.data.confirmedBy.toString()).toBe(riderUser._id.toString());
      expect(res.body.data.confirmedAt).toBeDefined();

      // Verify DB record in Payment ledger
      const payment = await Payment.findOne({ bookingId: booking._id });
      expect(payment).not.toBeNull();
      expect(payment.status).toBe('captured');
      expect(payment.confirmedBy.toString()).toBe(riderUser._id.toString());
      expect(payment.confirmedAt).toBeInstanceOf(Date);

      // Verify Booking paymentStatus updated to paid
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.paymentStatus).toBe('paid');
    });

    it('Ownership test: rejects cash confirmation from an unassigned rider with 404', async () => {
      const booking = await createEnRouteHomeBooking('cash');

      const res = await request(app)
        .post(`/api/rider/jobs/${booking._id}/cash-received`)
        .set('Authorization', `Bearer ${otherRiderToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('rejects cash confirmation on bookings with upi / online paymentMode', async () => {
      const booking = await createEnRouteHomeBooking('upi');

      const res = await request(app)
        .post(`/api/rider/jobs/${booking._id}/cash-received`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PAYMENT_MODE');
    });
  });

  describe('POST /api/rider/jobs/:id/submitted & Cold-Chain Telemetry', () => {
    it('Integration: cold-chain entries append, never overwrite, and rider is released back to available', async () => {
      const booking = await createEnRouteHomeBooking();

      // 1. Phlebotomist collects sample (Reading 1)
      const collectRes = await request(app)
        .post(`/api/rider/jobs/${booking._id}/collect`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ temperature: 4.1, notes: 'Collection reading' });
      expect(collectRes.status).toBe(201);

      // Verify initial reading
      let sample = await Sample.findOne({ bookingId: booking._id });
      expect(sample.coldChainLog).toHaveLength(1);
      expect(sample.coldChainLog[0].temperature).toBe(4.1);
      expect(sample.coldChainLog[0].notes).toBe('Collection reading');
      const initialTimestamp = sample.coldChainLog[0].recordedAt;

      // 2. Phlebotomist submits at lab (Reading 2)
      const submitRes = await request(app)
        .post(`/api/rider/jobs/${booking._id}/submitted`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ temperature: 4.8, notes: 'Lab intake handoff reading' });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.success).toBe(true);

      // Verify cold chain entries appended, never overwrote earlier reading
      sample = await Sample.findOne({ bookingId: booking._id });
      expect(sample.coldChainLog).toHaveLength(2);

      // First reading is intact
      expect(sample.coldChainLog[0].temperature).toBe(4.1);
      expect(sample.coldChainLog[0].notes).toBe('Collection reading');
      expect(sample.coldChainLog[0].recordedAt.getTime()).toBe(initialTimestamp.getTime());

      // Second reading was appended
      expect(sample.coldChainLog[1].temperature).toBe(4.8);
      expect(sample.coldChainLog[1].notes).toBe('Lab intake handoff reading');

      // Verify handoff timestamps
      expect(sample.handoffTimestamps.submittedAt).toBeInstanceOf(Date);
      expect(sample.handoffTimestamps.labReceivedAt).toBeInstanceOf(Date);

      // Verify booking status transitioned to 'at_lab'
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.status).toBe('at_lab');

      // Verify rider is freed back to available
      const updatedRider = await Rider.findById(riderProfile._id);
      expect(updatedRider.status).toBe('available');
      expect(updatedRider.currentBookingId).toBeNull();
    });
  });

  describe('Patient Tracking & Endpoint Ownership', () => {
    it('Patient sees barcode and cold-chain status on GET /api/bookings/:id once collected', async () => {
      const booking = await createEnRouteHomeBooking();

      await request(app)
        .post(`/api/rider/jobs/${booking._id}/collect`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ temperature: 4.3 });

      const res = await request(app)
        .get(`/api/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.barcode).toBeDefined();
      expect(res.body.data.sample).toBeDefined();
      expect(res.body.data.sample.coldChainLog).toHaveLength(1);
      expect(res.body.data.sample.coldChainLog[0].temperature).toBe(4.3);
    });

    it('Ownership test: another patient receives 404 when attempting to access the booking', async () => {
      const booking = await createEnRouteHomeBooking();

      const res = await request(app)
        .get(`/api/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${otherPatientToken}`);

      // CONTEXT §3.2: 404, not 403, on unowned records
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('CHECKPOINT: Full Home-Collection Lifecycle from Booking to at_lab', () => {
    it('executes full end-to-end lifecycle: booking → rider_assigned → en_route → collected → cash-received → at_lab', async () => {
      // 0. Ensure rider is available and present in geo search index
      await clearGeoStore();
      riderProfile.status = 'available';
      riderProfile.currentBookingId = null;
      await riderProfile.save();

      await addRiderLocation({
        labCenterId: labCenter._id,
        riderId: riderProfile._id,
        lat: 30.3165,
        lng: 78.0322,
      });

      // 1. Patient creates a home booking (rider allocated automatically per CONTEXT §6.1)
      const bookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', `lifecycle-idem-${Date.now()}`)
        .send({
            addressId: await addressFor(patientToken),
          testIds: [cbcTest._id.toString()],
          labCenterId: labCenter._id.toString(),
          mode: 'home',
          slotDateTime: new Date(Date.now() + 3600000).toISOString(),
          paymentMode: 'cash',
        });
      expect(bookRes.status).toBe(201);
      const bookingId = bookRes.body.data._id;
      expect(bookRes.body.data.status).toBe('rider_assigned');
      expect(bookRes.body.data.assignedRiderId.toString()).toBe(riderProfile._id.toString());


      // 3. Rider goes en route
      const enRouteRes = await request(app)
        .patch(`/api/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'en_route' });
      expect(enRouteRes.status).toBe(200);
      expect(enRouteRes.body.data.status).toBe('en_route');

      // 4. Rider arrives and collects sample
      const collectRes = await request(app)
        .post(`/api/rider/jobs/${bookingId}/collect`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ temperature: 4.2, notes: 'Sealed blood vial in box' });
      expect(collectRes.status).toBe(201);
      const barcode = collectRes.body.data.sample.barcode;
      expect(barcode).toBeDefined();
      expect(isValidBarcodeFormat(barcode)).toBe(true);

      // 5. Rider confirms cash payment received
      const cashRes = await request(app)
        .post(`/api/rider/jobs/${bookingId}/cash-received`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({});
      expect(cashRes.status).toBe(200);
      expect(cashRes.body.data.paymentStatus).toBe('paid');

      // 6. Rider hands off sample at partner lab
      const submitRes = await request(app)
        .post(`/api/rider/jobs/${bookingId}/submitted`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ temperature: 4.6, notes: 'Received by technician Sunita' });
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.data.booking.status).toBe('at_lab');

      // 7. Patient queries booking tracking endpoint: sees status at_lab, barcode, and cold chain log with 2 readings
      const patientTrackingRes = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(patientTrackingRes.status).toBe(200);
      const trackingData = patientTrackingRes.body.data;
      expect(trackingData.status).toBe('at_lab');
      expect(trackingData.barcode).toBe(barcode);
      expect(trackingData.paymentStatus).toBe('paid');
      expect(trackingData.sample).toBeDefined();
      expect(trackingData.sample.coldChainLog).toHaveLength(2);
      expect(trackingData.sample.coldChainLog[0].temperature).toBe(4.2);
      expect(trackingData.sample.coldChainLog[1].temperature).toBe(4.6);
      expect(trackingData.sample.handoffTimestamps.collectedAt).toBeDefined();
      expect(trackingData.sample.handoffTimestamps.submittedAt).toBeDefined();
    });
  });
});

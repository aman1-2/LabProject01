// backend/tests/integration/bookingTracking.test.js
import { createServer } from 'http';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import RedisMock from 'ioredis-mock';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Booking from '../../src/schemas/Booking.js';
import Rider from '../../src/schemas/Rider.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { waitForCount, onceWithTimeout } from '../helpers/waitFor.js';
import {
  initializeSocket,
  closeSocket,
  emitBookingStatusUpdate,
  emitRiderLocation,
} from '../../src/sockets/socketServer.js';
import { clearGeoStore } from '../../src/utils/redisGeoHelper.js';

/**
 * Connecting a socket here contends with other suites' in-memory replica sets,
 * so this is a startup budget rather than a latency assertion. It fails with a
 * message naming the event that never arrived.
 */
const CONNECT_TIMEOUT_MS = 30000;

describe('Real-Time Booking Tracking Integration Tests (P06)', () => {
  let replSet;
  let app;
  let httpServer;
  let serverPort;
  let patientUser;
  let riderUser;
  let riderDoc;
  let patientToken;
  let riderToken;
  let labCenter;
  let cbcTest;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);

    app = createApp();
    httpServer = createServer(app);

    // Initialize Socket.IO on the HTTP server with mock Redis adapter for fast, robust tests
    const pubClient = new RedisMock();
    const subClient = new RedisMock();
    initializeSocket(httpServer, { pubClient, subClient });

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });
  }, 60000);

  afterAll(async () => {
    await closeSocket();
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await Booking.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await clearGeoStore();
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  beforeEach(async () => {
    await Booking.deleteMany({});
    await Rider.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await clearGeoStore();

    // Seed Lab Center
    labCenter = await LabCenter.create({
      name: 'PathCare Central Lab',
      area: 'Shivajinagar',
      address: '100 Infantry Road, Bangalore',
      geo: {
        type: 'Point',
        coordinates: [77.5946, 12.9716],
      },
      operatingHours: { open: '06:00', close: '22:00' },
      supportedTests: [],
      dailyCapacity: 200,
    });

    // Seed Test
    cbcTest = await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: 'complete-blood-count-cbc-trk',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 299,
      turnaroundHrs: 6,
      parametersCount: 24,
      parameters: ['Hemoglobin', 'RBC Count', 'WBC Count'],
      description: 'Measures red cells, white cells, haemoglobin and platelets.',
      prepInstructions: 'No special preparation needed.',
      reportFormat: 'Digital PDF + Reference ranges',
    });

    // Seed Patient User
    patientUser = await User.create({
      accountHandle: 'tracker_patient',
      phone: '9876543210',
      name: 'Tracking Patient',
      passwordHash: 'dummy_hash',
      role: 'patient',
      location: {
        lat: 12.9716,
        lng: 77.5946,
        address: 'MG Road, Bangalore',
      },
    });
    patientToken = generateAccessToken({
      userId: patientUser._id.toString(),
      accountHandle: patientUser.accountHandle,
      role: 'patient',
    });

    // Seed Rider User & Rider Profile
    riderUser = await User.create({
      accountHandle: 'tracker_rider',
      phone: '9123456780',
      name: 'Phlebotomist Rohit',
      passwordHash: 'dummy_hash',
      role: 'rider',
      location: {
        lat: 12.972,
        lng: 77.595,
        address: 'Brigade Road, Bangalore',
      },
    });
    riderToken = generateAccessToken({
      userId: riderUser._id.toString(),
      accountHandle: riderUser.accountHandle,
      role: 'rider',
    });

    riderDoc = await Rider.create({
      userId: riderUser._id,
      labCenterId: labCenter._id,
      currentStatus: 'idle',
      geo: {
        type: 'Point',
        coordinates: [77.595, 12.972],
      },
    });
  });

  // The socket server rejects unauthenticated connections (BLOCKER #9), so test
  // clients must present an access token in the handshake.
  function authedClient(port, token) {
    return ioClient(`http://localhost:${port}`, { auth: { token } });
  }

  describe('1. Real-time Status Transitions & Room Scoping', () => {
    it('emits BOOKING_STATUS_UPDATED into that booking room only', async () => {
      // Create two bookings
      const b1 = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'pending',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: 'TRK-IDEMP-001',
        // This test covers socket room scoping, not authorisation. The rider
        // must legitimately own the job for the transition to be permitted.
        assignedRiderId: riderDoc._id,
        collectionAddress: {
          label: 'Home',
          line: '123 Test St',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        },
      });

      const b2 = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'pending',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: 'TRK-IDEMP-002',
        collectionAddress: {
          label: 'Home',
          line: '456 Other St',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        },
      });

      // Connect two socket clients
      const client1 = authedClient(serverPort, patientToken);
      const client2 = authedClient(serverPort, patientToken);

      await onceWithTimeout(client1, 'connect', { timeoutMs: CONNECT_TIMEOUT_MS });
      await onceWithTimeout(client2, 'connect', { timeoutMs: CONNECT_TIMEOUT_MS });

      // Register room join listeners BEFORE emitting join_booking to avoid race conditions
      const join1Promise = onceWithTimeout(client1, 'joined_booking');
      const join2Promise = onceWithTimeout(client2, 'joined_booking');

      // Client 1 joins booking 1; Client 2 joins booking 2
      client1.emit('join_booking', { bookingId: b1._id.toString() });
      client2.emit('join_booking', { bookingId: b2._id.toString() });

      // Wait for room join confirmation
      await Promise.all([join1Promise, join2Promise]);

      const client1Received = [];
      const client2Received = [];

      client1.on('BOOKING_STATUS_UPDATED', (data) => client1Received.push(data));
      client2.on('BOOKING_STATUS_UPDATED', (data) => client2Received.push(data));

      // Transition booking 1 status: pending -> rider_assigned
      const res = await request(app)
        .patch(`/api/bookings/${b1._id}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'rider_assigned' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rider_assigned');

      // Poll for the event rather than sleeping a fixed 150ms. That interval
      // was an assumption about machine speed: it held on an idle box and
      // missed under load, failing as though room scoping were broken.
      await waitForCount(() => client1Received, 1, { describe: 'BOOKING_STATUS_UPDATED on client1' });

      // Client 1 MUST have received the status update
      expect(client1Received.length).toBe(1);
      expect(client1Received[0].bookingId).toBe(b1._id.toString());
      expect(client1Received[0].status).toBe('rider_assigned');

      // Client 2 MUST NOT have received the event (scoped to room only)
      expect(client2Received.length).toBe(0);

      client1.disconnect();
      client2.disconnect();
    });

    it('emits RIDER_LOCATION on rider location ping into that booking room only', async () => {
      const booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'en_route',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: 'TRK-IDEMP-003',
        collectionAddress: {
          label: 'Home',
          line: '123 Test St',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        },
      });

      const client = authedClient(serverPort, patientToken);
      await onceWithTimeout(client, 'connect', { timeoutMs: CONNECT_TIMEOUT_MS });
      const joinPromise = onceWithTimeout(client, 'joined_booking');
      client.emit('join_booking', { bookingId: booking._id.toString() });
      await joinPromise;

      const locationEvents = [];
      client.on('RIDER_LOCATION', (data) => locationEvents.push(data));

      // Direct emit helper test
      emitRiderLocation(booking._id, {
        riderId: 'rider_123',
        lat: 12.973,
        lng: 77.596,
      });

      await waitForCount(() => locationEvents, 1, { describe: 'RIDER_LOCATION event' });

      expect(locationEvents.length).toBe(1);
      expect(locationEvents[0].bookingId).toBe(booking._id.toString());
      expect(locationEvents[0].lat).toBe(12.973);
      expect(locationEvents[0].lng).toBe(77.596);

      client.disconnect();
    });
  });

  describe('2. State Machine Validation (CONTEXT §5.2)', () => {
    it('rejects invalid jump from pending directly to at_lab', async () => {
      const booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'pending',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: 'TRK-IDEMP-004',
        // Assigned so this test exercises the state machine, not authorisation.
        assignedRiderId: riderDoc._id,
        collectionAddress: {
          label: 'Home',
          line: '123 Test St',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        },
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'at_lab' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('strictly forbids cancelling a booking once collected', async () => {
      const booking = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'collected',
        barcode: 'BARCODE-9988',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: 'TRK-IDEMP-005',
        collectionAddress: {
          label: 'Home',
          line: '123 Test St',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        },
      });

      // Patient attempts to cancel after collection
      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ status: 'cancelled', reason: 'Patient changed mind' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects home-specific status on a lab visit booking', async () => {
      const visitBooking = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'visit',
        status: 'awaiting_confirm',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: 'TRK-IDEMP-006',
        // Assigned so this test exercises mode validation, not authorisation.
        assignedRiderId: riderDoc._id,
      });

      // Cannot assign rider to a lab visit booking
      const res = await request(app)
        .patch(`/api/bookings/${visitBooking._id}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'rider_assigned' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  // ── BLOCKER #4 regression ────────────────────────────────────────────────
  // PATCH /api/bookings/:id/status was gated on isAuthenticated only, and the
  // service constrained role==='patient' and nothing else. Any authenticated
  // rider / lab_admin / doctor could drive ANY booking through any legal
  // transition. It also leaked booking state: a 400 naming the current status
  // proved a booking existed where a 404 proved it did not.
  describe('BLOCKER #4 — status transitions require entitlement to the booking', () => {
    let strangerBooking;

    beforeEach(async () => {
      strangerBooking = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'pending',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: `TRK-B4-${Date.now()}-${Math.random()}`,
        // Deliberately unassigned — nobody but the patient is entitled to it.
        assignedRiderId: null,
      });
    });

    it('refuses a rider who is not assigned to the booking', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${strangerBooking._id}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'rider_assigned' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');

      const unchanged = await Booking.findById(strangerBooking._id);
      expect(unchanged.status).toBe('pending');
    });

    it('refuses a rider assigned to a DIFFERENT booking', async () => {
      const otherBooking = await Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'pending',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: `TRK-B4-OTHER-${Date.now()}`,
        assignedRiderId: riderDoc._id,
      });

      // Rider owns otherBooking, but not strangerBooking.
      const res = await request(app)
        .patch(`/api/bookings/${strangerBooking._id}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'rider_assigned' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
      expect(otherBooking._id.toString()).not.toBe(strangerBooking._id.toString());
    });

    it('does not leak booking existence: a real booking and a fabricated id answer identically', async () => {
      const fabricatedId = new mongoose.Types.ObjectId();

      const realRes = await request(app)
        .patch(`/api/bookings/${strangerBooking._id}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'at_lab' });

      const fakeRes = await request(app)
        .patch(`/api/bookings/${fabricatedId}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'at_lab' });

      // Previously: real booking -> 400 INVALID_STATUS_TRANSITION naming the
      // current status; fabricated id -> 404. That difference is the oracle.
      expect(realRes.status).toBe(fakeRes.status);
      expect(realRes.body.error.code).toBe(fakeRes.body.error.code);
      expect(realRes.status).toBe(404);
    });

    it('refuses a lab admin whose centre does not own the booking', async () => {
      const otherCentre = await LabCenter.create({
        name: 'Unrelated Diagnostics',
        area: 'Elsewhere',
        address: '9 Elsewhere Road, Bangalore',
        geo: { type: 'Point', coordinates: [77.6, 12.98] },
        priceMultiplier: 1.0,
        turnaroundHrs: 6,
      });

      const foreignAdmin = await User.create({
        accountHandle: `foreign_lab_admin_${Date.now()}`,
        phone: `91${Date.now().toString().slice(-8)}`,
        name: 'Foreign Lab Admin',
        passwordHash: 'dummy_hash',
        location: { lat: 12.972, lng: 77.595, address: 'Bangalore' },
        role: 'lab_admin',
        labCenterId: otherCentre._id,
      });

      const foreignToken = generateAccessToken({
        userId: foreignAdmin._id.toString(),
        accountHandle: foreignAdmin.accountHandle,
        role: 'lab_admin',
      });

      const res = await request(app)
        .patch(`/api/bookings/${strangerBooking._id}/status`)
        .set('Authorization', `Bearer ${foreignToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('refuses a lab admin with no centre bound at all (fail closed)', async () => {
      const unboundAdmin = await User.create({
        accountHandle: `unbound_lab_admin_${Date.now()}`,
        phone: `92${Date.now().toString().slice(-8)}`,
        name: 'Unbound Lab Admin',
        passwordHash: 'dummy_hash',
        location: { lat: 12.972, lng: 77.595, address: 'Bangalore' },
        role: 'lab_admin',
        // labCenterId deliberately omitted — schema default is null.
      });

      const unboundToken = generateAccessToken({
        userId: unboundAdmin._id.toString(),
        accountHandle: unboundAdmin.accountHandle,
        role: 'lab_admin',
      });

      const res = await request(app)
        .patch(`/api/bookings/${strangerBooking._id}/status`)
        .set('Authorization', `Bearer ${unboundToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('refuses a doctor outright', async () => {
      const doctorUser = await User.create({
        accountHandle: `doctor_actor_${Date.now()}`,
        phone: `93${Date.now().toString().slice(-8)}`,
        name: 'Dr Curious',
        passwordHash: 'dummy_hash',
        location: { lat: 12.972, lng: 77.595, address: 'Bangalore' },
        role: 'doctor',
      });

      const doctorToken = generateAccessToken({
        userId: doctorUser._id.toString(),
        accountHandle: doctorUser.accountHandle,
        role: 'doctor',
      });

      const res = await request(app)
        .patch(`/api/bookings/${strangerBooking._id}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'cancelled' });

      // Blocked at the route's role gate before reaching the service.
      expect([403, 404]).toContain(res.status);

      const unchanged = await Booking.findById(strangerBooking._id);
      expect(unchanged.status).toBe('pending');
    });

    it('still allows the owning patient to cancel their own booking', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${strangerBooking._id}/status`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ status: 'cancelled', reason: 'Changed my mind' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('refuses a patient who does not own the booking', async () => {
      const otherPatient = await User.create({
        accountHandle: `other_patient_${Date.now()}`,
        phone: `94${Date.now().toString().slice(-8)}`,
        name: 'Other Patient',
        passwordHash: 'dummy_hash',
        location: { lat: 12.972, lng: 77.595, address: 'Bangalore' },
        role: 'patient',
      });

      const otherToken = generateAccessToken({
        userId: otherPatient._id.toString(),
        accountHandle: otherPatient.accountHandle,
        role: 'patient',
      });

      const res = await request(app)
        .patch(`/api/bookings/${strangerBooking._id}/status`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('3. Multi-Instance Redis Adapter Pub/Sub (CONTEXT §6.3)', () => {
    it('delivers an event emitted on Instance A to a client connected to Instance B', async () => {
      // Shared Redis pub/sub mock channels
      const pubA = new RedisMock();
      const subA = new RedisMock();
      const pubB = new RedisMock();
      const subB = new RedisMock();

      // Instance A
      const serverA = createServer();
      const ioA = new Server(serverA);
      ioA.adapter(createAdapter(pubA, subA));

      // Instance B
      const serverB = createServer();
      const ioB = new Server(serverB);
      ioB.adapter(createAdapter(pubB, subB));

      ioB.on('connection', (socket) => {
        socket.on('join_booking', (data) => {
          socket.join(`booking:${data.bookingId}`);
          socket.emit('joined');
        });
      });

      await new Promise((r) => serverA.listen(0, r));
      await new Promise((r) => serverB.listen(0, r));

      const portB = serverB.address().port;

      // Client connects to Instance B
      const clientOnB = ioClient(`http://localhost:${portB}`);
      await new Promise((r) => clientOnB.on('connect', r));

      clientOnB.emit('join_booking', { bookingId: 'cluster-booking-123' });
      await new Promise((r) => clientOnB.on('joined', r));

      const receivedEvents = [];
      clientOnB.on('BOOKING_STATUS_UPDATED', (payload) => {
        receivedEvents.push(payload);
      });

      // Small delay for Redis adapter subscriptions
      await new Promise((r) => setTimeout(r, 100));

      // Emit from Instance A into room booking:cluster-booking-123
      ioA.to('booking:cluster-booking-123').emit('BOOKING_STATUS_UPDATED', {
        bookingId: 'cluster-booking-123',
        status: 'en_route',
        instance: 'instance-A',
      });

      // Wait for cross-instance propagation over Redis adapter
      await new Promise((r) => setTimeout(r, 150));

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].bookingId).toBe('cluster-booking-123');
      expect(receivedEvents[0].status).toBe('en_route');
      expect(receivedEvents[0].instance).toBe('instance-A');

      clientOnB.disconnect();
      await new Promise((r) => ioA.close(r));
      await new Promise((r) => ioB.close(r));
      await new Promise((r) => serverA.close(r));
      await new Promise((r) => serverB.close(r));
      await pubA.quit();
      await subA.quit();
      await pubB.quit();
      await subB.quit();
    });
  });
  // -- BLOCKER #9 regression --------------------------------------------------
  // join_booking accepted any bookingId from any client, with no handshake auth
  // and no ownership check. An anonymous websocket client could subscribe to
  // booking:<id> for ANY booking and receive that patient's diagnostic progress
  // and their phlebotomist's live GPS coordinates.
  describe('BLOCKER #9 -- socket rooms require authentication and entitlement', () => {
    async function makeBooking(overrides = {}) {
      return Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'pending',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: `TRK-B9-${Date.now()}-${Math.random()}`,
        ...overrides,
      });
    }

    function connectExpectingFailure(port, opts) {
      const client = ioClient(`http://localhost:${port}`, {
        ...opts,
        reconnection: false,
      });
      return new Promise((resolve) => {
        client.on('connect', () => resolve({ connected: true, client }));
        client.on('connect_error', (err) =>
          resolve({ connected: false, error: err.message, client })
        );
      });
    }

    it('rejects a socket connection with no token at all', async () => {
      const { connected, error, client } = await connectExpectingFailure(serverPort, {});
      client.close();

      expect(connected).toBe(false);
      expect(error).toBe('UNAUTHORIZED');
    });

    it('rejects a socket connection with a forged token', async () => {
      const { connected, error, client } = await connectExpectingFailure(serverPort, {
        auth: { token: 'not.a.real.jwt' },
      });
      client.close();

      expect(connected).toBe(false);
      expect(error).toBe('UNAUTHORIZED');
    });

    it('denies an authenticated patient joining ANOTHER patient booking room', async () => {
      const strangerUser = await User.create({
        accountHandle: `stranger_${Date.now()}`,
        phone: `95${Date.now().toString().slice(-8)}`,
        name: 'Stranger Patient',
        passwordHash: 'dummy_hash',
        role: 'patient',
        location: { lat: 12.97, lng: 77.59, address: 'Bangalore' },
      });
      const strangerToken = generateAccessToken({
        userId: strangerUser._id.toString(),
        role: 'patient',
      });

      const victimBooking = await makeBooking();

      const client = authedClient(serverPort, strangerToken);
      await onceWithTimeout(client, 'connect', { timeoutMs: CONNECT_TIMEOUT_MS });

      const outcome = await new Promise((resolve) => {
        client.once('joined_booking', () => resolve('joined'));
        client.once('join_booking_denied', () => resolve('denied'));
        client.emit('join_booking', { bookingId: victimBooking._id.toString() });
      });

      expect(outcome).toBe('denied');

      // And no events reach them.
      const received = [];
      client.on('BOOKING_STATUS_UPDATED', (d) => received.push(d));
      emitBookingStatusUpdate(victimBooking._id, { status: 'rider_assigned' });
      await new Promise((r) => setTimeout(r, 150));
      client.close();

      expect(received).toEqual([]);
    });

    it('denies a rider who is not assigned to the booking, and leaks no GPS', async () => {
      const booking = await makeBooking({ assignedRiderId: null });

      const client = authedClient(serverPort, riderToken);
      await onceWithTimeout(client, 'connect', { timeoutMs: CONNECT_TIMEOUT_MS });

      const outcome = await new Promise((resolve) => {
        client.once('joined_booking', () => resolve('joined'));
        client.once('join_booking_denied', () => resolve('denied'));
        client.emit('join_booking', { bookingId: booking._id.toString() });
      });

      expect(outcome).toBe('denied');

      const locations = [];
      client.on('RIDER_LOCATION', (d) => locations.push(d));
      emitRiderLocation(booking._id, { riderId: 'x', lat: 12.9, lng: 77.6 });
      await new Promise((r) => setTimeout(r, 150));
      client.close();

      expect(locations).toEqual([]);
    });

    it('allows the owning patient to join their own booking room', async () => {
      const booking = await makeBooking();

      const client = authedClient(serverPort, patientToken);
      await onceWithTimeout(client, 'connect', { timeoutMs: CONNECT_TIMEOUT_MS });

      const outcome = await new Promise((resolve) => {
        client.once('joined_booking', () => resolve('joined'));
        client.once('join_booking_denied', () => resolve('denied'));
        client.emit('join_booking', { bookingId: booking._id.toString() });
      });

      expect(outcome).toBe('joined');
      client.close();
    });

    it('allows the ASSIGNED rider to join and receive location events', async () => {
      const booking = await makeBooking({ assignedRiderId: riderDoc._id });

      const client = authedClient(serverPort, riderToken);
      await onceWithTimeout(client, 'connect', { timeoutMs: CONNECT_TIMEOUT_MS });

      const outcome = await new Promise((resolve) => {
        client.once('joined_booking', () => resolve('joined'));
        client.once('join_booking_denied', () => resolve('denied'));
        client.emit('join_booking', { bookingId: booking._id.toString() });
      });

      expect(outcome).toBe('joined');
      client.close();
    });

    it('denies joining a booking id that does not exist', async () => {
      const client = authedClient(serverPort, patientToken);
      await onceWithTimeout(client, 'connect', { timeoutMs: CONNECT_TIMEOUT_MS });

      const fabricated = new mongoose.Types.ObjectId().toString();
      const outcome = await new Promise((resolve) => {
        client.once('joined_booking', () => resolve('joined'));
        client.once('join_booking_denied', () => resolve('denied'));
        client.emit('join_booking', { bookingId: fabricated });
      });

      expect(outcome).toBe('denied');
      client.close();
    });
  });
  // -- HIGH H4 regression -----------------------------------------------------
  // transitionBookingStatus read the booking, validated the state machine, then
  // called booking.save(). Two concurrent transitions from the same status both
  // validated and both saved -- last write wins. Concurrent 'cancelled' and
  // 'collected' from 'en_route' could leave a booking cancelled (and refunded)
  // after the sample had already been drawn.
  describe('HIGH H4 -- status transitions are atomic', () => {
    async function enRouteBooking() {
      return Booking.create({
        patientId: patientUser._id,
        testIds: [cbcTest._id],
        labCenterId: labCenter._id,
        mode: 'home',
        status: 'en_route',
        slotDateTime: new Date(),
        amount: 350,
        paymentMode: 'prepaid',
        paymentStatus: 'paid',
        idempotencyKey: `TRK-H4-${Date.now()}-${Math.random()}`,
        assignedRiderId: riderDoc._id,
      });
    }

    it('commits exactly one of two concurrent transitions from the same status', async () => {
      const booking = await enRouteBooking();

      // Promise.all -- sequential awaits would never race (CONTEXT §10).
      const [cancelRes, collectRes] = await Promise.all([
        request(app)
          .patch(`/api/bookings/${booking._id}/status`)
          .set('Authorization', `Bearer ${patientToken}`)
          .send({ status: 'cancelled', reason: 'Patient changed mind' }),
        request(app)
          .patch(`/api/bookings/${booking._id}/status`)
          .set('Authorization', `Bearer ${riderToken}`)
          .send({ status: 'collected' }),
      ]);

      // EXACTLY one may commit. Under read-modify-write both returned 200 --
      // cancel reporting 'cancelled' and collect reporting 'collected' for the
      // same booking, with the last write silently winning.
      const successes = [cancelRes, collectRes].filter((r) => r.status === 200);
      expect(successes).toHaveLength(1);

      const loser = [cancelRes, collectRes].find((r) => r.status !== 200);
      expect([400, 409]).toContain(loser.status);

      // The surviving status is the one that actually won, not a blend.
      const finalBooking = await Booking.findById(booking._id);
      expect(finalBooking.status).toBe(successes[0].body.data.status);
    });

    it('a collected sample cannot be retroactively cancelled by a stale writer', async () => {
      const booking = await enRouteBooking();

      // The rider collects.
      const collect = await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'collected' });
      expect(collect.status).toBe(200);

      // A patient cancel that was decided against the old 'en_route' state.
      const cancel = await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ status: 'cancelled', reason: 'Too late' });

      expect([400, 409]).toContain(cancel.status);

      const finalBooking = await Booking.findById(booking._id);
      expect(finalBooking.status).toBe('collected');
    });

    it('reports a conflict rather than silently discarding the write', async () => {
      const booking = await enRouteBooking();

      const [a, b] = await Promise.all([
        request(app)
          .patch(`/api/bookings/${booking._id}/status`)
          .set('Authorization', `Bearer ${riderToken}`)
          .send({ status: 'collected' }),
        request(app)
          .patch(`/api/bookings/${booking._id}/status`)
          .set('Authorization', `Bearer ${riderToken}`)
          .send({ status: 'collected' }),
      ]);

      const successes = [a, b].filter((r) => r.status === 200);
      expect(successes).toHaveLength(1);
      const loser = [a, b].find((r) => r.status !== 200);
      expect([400, 409]).toContain(loser.status);
    });
  });
});

import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import { User } from '../../src/schemas/User.js';
import { TestCatalog } from '../../src/schemas/TestCatalog.js';
import { LabCenter } from '../../src/schemas/LabCenter.js';
import { Booking } from '../../src/schemas/Booking.js';
import { bookingRepository } from '../../src/repositories/bookingRepository.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';

/**
 * Booking a package.
 *
 * Packages are TestCatalog rows with `category: 'package'`. Booking.packageIds
 * was a single `packageId` until a basket needed to hold two checkups; the
 * legacy singular field is still accepted on input and folded into the list.
 *
 * Historically Booking.packageId
 * declared `ref: 'TestPackage'` — an orphaned parallel model nothing writes to —
 * so every populate resolved against an empty collection and returned null.
 * The booking kept a valid id and lost the product name everywhere it was shown:
 * the patient's track screen, the rider's job card, the lab queue.
 */
describe('Package bookings', () => {
  let mongoServer;
  let app;
  let patientToken;
  let patient;
  let pkg;
  let labCenter;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_pkg_test' } });
    await connectDB(mongoServer.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDB();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await resetRateLimitStore();
    await Promise.all([
      User.deleteMany({}),
      TestCatalog.deleteMany({}),
      LabCenter.deleteMany({}),
      Booking.deleteMany({}),
    ]);

    patient = await User.create({
      accountHandle: 'pkg_patient',
      phone: '9840000001',
      name: 'Package Patient',
      passwordHash: await bcrypt.hash('Str0ngPass!x', 10),
      role: 'patient',
      location: { lat: 30.3165, lng: 78.0322, address: 'Dehradun', source: 'manual' },
    });
    patientToken = generateAccessToken({ userId: patient._id.toString(), role: 'patient' });

    pkg = await TestCatalog.create({
      name: 'Full Body Checkup — Comprehensive',
      slug: 'full-body-checkup-comprehensive',
      category: 'package',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 3499,
      strikePrice: 4999,
      turnaroundHrs: 10,
      parametersCount: 90,
      description: 'A 90-parameter panel.',
      prepInstructions: '12-hour fasting required.',
    });

    labCenter = await LabCenter.create({
      name: 'Sunrise Diagnostics',
      area: 'Rajpur Road',
      address: '221 Rajpur Road, Dehradun 248001',
      geo: { type: 'Point', coordinates: [78.0322, 30.3165] },
      priceMultiplier: 1.0,
      turnaroundHrs: 8,
      isVerified: true,
      accreditation: { nabl: true, iso: true },
    });
  });

  /**
   * Booked as a lab visit. Home mode would trigger rider dispatch and fail with
   * 422 for want of a phlebotomist, which has nothing to do with what these
   * tests are about.
   */
  async function bookPackage(overrides = {}) {
    return request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', `pkg-${Date.now()}-${Math.random()}`)
      .send({
        testIds: [],
        packageId: pkg._id.toString(),
        labCenterId: labCenter._id.toString(),
        mode: 'visit',
        slotDateTime: new Date(Date.now() + 86400000).toISOString(),
        paymentMode: 'upi',
        ...overrides,
      });
  }

  /** The API may return ids or populated documents; compare identifiers. */
  function idOf(ref) {
    return typeof ref === 'string' ? ref : String(ref?.id ?? ref?._id);
  }

  it('creates a booking from a package sent the legacy singular way', async () => {
    const res = await bookPackage();

    expect(res.status).toBe(201);
    const booking = res.body.data?.booking ?? res.body.data;

    // A singular `packageId` still works — the mobile app sends it — and lands
    // in the list.
    expect(booking.packageIds).toHaveLength(1);
    expect(idOf(booking.packageIds[0])).toBe(pkg._id.toString());
  });

  it('resolves the package name when populated', async () => {
    // This is the assertion that failed when the ref pointed at an orphaned
    // model: a valid id that populated to null.
    const res = await bookPackage();
    const bookingId = (res.body.data?.booking ?? res.body.data)._id;

    const populated = await Booking.findById(bookingId).populate(
      'packageIds',
      'name slug category'
    );

    expect(populated.packageIds).toHaveLength(1);
    expect(populated.packageIds[0].name).toBe('Full Body Checkup — Comprehensive');
    expect(populated.packageIds[0].category).toBe('package');
  });

  it('resolves it through the repository the app actually calls', async () => {
    const res = await bookPackage();
    const bookingId = (res.body.data?.booking ?? res.body.data)._id;

    const found = await bookingRepository.findById(bookingId);

    // bookingRepository.findById populates packageIds for every consumer of a
    // booking — the track screen, the lab queue, the rider job card.
    expect(found.packageIds).toHaveLength(1);
    expect(found.packageIds[0].name).toBe('Full Body Checkup — Comprehensive');
  });

  it('books two packages in one booking and charges for both', async () => {
    const second = await TestCatalog.create({
      name: 'Full Body Checkup — Essential',
      slug: 'full-body-checkup-essential-multi',
      category: 'package',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 1499,
      turnaroundHrs: 8,
      prepInstructions: '10 hours fasting.',
      description: 'A 54-parameter baseline.',
    });

    const res = await bookPackage({
      packageId: undefined,
      packageIds: [pkg._id.toString(), second._id.toString()],
    });

    expect(res.status).toBe(201);
    const booking = res.body.data?.booking ?? res.body.data;

    // The whole reason the field became a list: this used to be impossible to
    // record, and the second checkup had to be filed as an ordinary test line.
    expect(booking.packageIds).toHaveLength(2);
    expect(booking.packageIds.map(idOf).sort()).toEqual(
      [pkg._id.toString(), second._id.toString()].sort()
    );

    // And both are paid for. The multiplier is applied once over the sum.
    const multiplier = labCenter.priceMultiplier ?? 1;
    expect(booking.amount).toBe(Math.round((pkg.basePrice + second.basePrice) * multiplier));
  });

  it('charges once when a client sends the same package both ways', async () => {
    // Exactly what a half-updated client sends during a rollout: the new field
    // and the old one, naming the same package.
    const res = await bookPackage({
      packageId: pkg._id.toString(),
      packageIds: [pkg._id.toString()],
    });

    expect(res.status).toBe(201);
    const booking = res.body.data?.booking ?? res.body.data;

    expect(booking.packageIds).toHaveLength(1);
    const multiplier = labCenter.priceMultiplier ?? 1;
    expect(booking.amount).toBe(Math.round(pkg.basePrice * multiplier));
  });

  it('mixes a package with individual tests in one booking', async () => {
    const bloodTest = await TestCatalog.create({
      name: 'Vitamin D (Total)',
      slug: 'vitamin-d-total-multi',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 1200,
      turnaroundHrs: 24,
      prepInstructions: 'No fasting required.',
      description: 'Vitamin D level.',
    });

    const res = await bookPackage({ testIds: [bloodTest._id.toString()] });

    expect(res.status).toBe(201);
    const booking = res.body.data?.booking ?? res.body.data;

    expect(booking.packageIds).toHaveLength(1);
    expect(booking.testIds).toHaveLength(1);

    const multiplier = labCenter.priceMultiplier ?? 1;
    expect(booking.amount).toBe(Math.round((pkg.basePrice + bloodTest.basePrice) * multiplier));
  });

  it('rejects the whole booking when any package is unknown', async () => {
    const res = await bookPackage({
      packageId: undefined,
      packageIds: [pkg._id.toString(), 'not-a-real-package'],
    });

    // No partial booking: recording one of the two checkups someone selected,
    // at a price they did not agree to, is worse than failing.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PACKAGE_NOT_FOUND');
  });

  it('prices the package server-side, ignoring any client-supplied amount', async () => {
    // CONTEXT §3.2 — a client-supplied price is ignored.
    const res = await bookPackage({ amount: 1 });

    expect(res.status).toBe(201);
    const booking = res.body.data?.booking ?? res.body.data;
    expect(booking.amount).toBe(3499);
  });

  it('serves packages through the catalogue, which is how the app finds them', async () => {
    const res = await request(app).get('/api/tests').query({ category: 'package' });

    expect(res.status).toBe(200);
    const slugs = res.body.data.items.map((item) => item.slug);
    expect(slugs).toContain('full-body-checkup-comprehensive');
  });
});

import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import { TestCatalog } from '../../src/schemas/TestCatalog.js';
import { LabCenter } from '../../src/schemas/LabCenter.js';
import { calculateBookingPrice } from '../../src/services/pricingService.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';

/**
 * Pricing a cart server-side.
 *
 * The reason this endpoint exists is that the same arithmetic used to live in
 * three places — this service, the website's BookingPage and the mobile
 * checkout — kept in step by hand. So the assertions that matter most here are
 * not "does it add up", they are:
 *
 *   - the quote equals what `createBooking` would charge, computed by the same
 *     function rather than a reimplementation of its formula;
 *   - subtotal + labAdjustment === total exactly, so the column a patient
 *     reads adds up to what leaves their account;
 *   - no lab means no total, rather than the subtotal dressed up as a price.
 */
describe('POST /api/cart/quote', () => {
  let mongoServer;
  let app;
  let pkg;
  let cbc;
  let vitaminD;
  let sugar;
  let urine;
  let ultrasound;
  let sunrise;
  let doonPath;
  let unverifiedLab;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_cart_test' } });
    await connectDB(mongoServer.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDB();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    resetRateLimitStore();
    await TestCatalog.deleteMany({});
    await LabCenter.deleteMany({});

    [pkg, cbc, vitaminD, sugar, urine, ultrasound] = await TestCatalog.create([
      {
        name: 'Full Body Checkup — Essential',
        slug: 'full-body-checkup-essential',
        category: 'package',
        sampleType: 'Blood',
        homeCollectionAvailable: true,
        basePrice: 1499,
        turnaroundHrs: 8,
        prepInstructions: '10 hours fasting.',
        parametersCount: 54,
        parameters: ['CBC (24)', 'Lipid Profile (10)'],
        description: 'A 54-parameter baseline.',
      },
      {
        name: 'Complete Blood Count (CBC)',
        slug: 'complete-blood-count-cbc',
        category: 'single',
        sampleType: 'Blood',
        homeCollectionAvailable: true,
        basePrice: 350,
        turnaroundHrs: 12,
        prepInstructions: 'No fasting required.',
        parametersCount: 24,
        parameters: ['Hemoglobin', 'RBC Count'],
        description: 'Blood cell counts.',
      },
      {
        name: 'Vitamin D (Total)',
        slug: 'vitamin-d-total',
        category: 'single',
        sampleType: 'Blood',
        homeCollectionAvailable: true,
        basePrice: 250,
        turnaroundHrs: 24,
        prepInstructions: 'No fasting required.',
        description: 'Vitamin D level.',
      },
      {
        // These two exist for their arithmetic. At Sunrise's 1.15 multiplier
        // they are 233 rounded once over the basket and 234 rounded per line,
        // which is the only way to tell the two strategies apart.
        name: 'Random Blood Sugar',
        slug: 'random-blood-sugar',
        category: 'single',
        sampleType: 'Blood',
        homeCollectionAvailable: true,
        basePrice: 99,
        turnaroundHrs: 4,
        prepInstructions: 'No fasting required.',
        description: 'Blood glucose at any time of day.',
      },
      {
        name: 'Urine Routine',
        slug: 'urine-routine',
        category: 'single',
        sampleType: 'Urine',
        homeCollectionAvailable: true,
        basePrice: 104,
        turnaroundHrs: 6,
        prepInstructions: 'Midstream sample.',
        description: 'Routine urine examination.',
      },
      {
        name: 'Ultrasound — Whole Abdomen',
        slug: 'ultrasound-whole-abdomen',
        category: 'imaging',
        sampleType: 'Imaging',
        homeCollectionAvailable: false,
        basePrice: 1200,
        turnaroundHrs: 48,
        prepInstructions: 'Full bladder required.',
        description: 'Abdominal ultrasound.',
      },
    ]);

    [sunrise, doonPath, unverifiedLab] = await LabCenter.create([
      {
        name: 'Sunrise Diagnostics',
        area: 'Rajpur Road',
        address: '12 Rajpur Road, Dehradun',
        geo: { type: 'Point', coordinates: [78.0322, 30.3165] },
        priceMultiplier: 1.15,
        isVerified: true,
        turnaroundHrs: 6,
        accreditation: { nabl: true, iso: true },
      },
      {
        name: 'Doon Path Labs',
        area: 'Ballupur Chowk',
        address: '3 Ballupur, Dehradun',
        geo: { type: 'Point', coordinates: [78.0122, 30.3265] },
        priceMultiplier: 0.92,
        isVerified: true,
        turnaroundHrs: 8,
        accreditation: { nabl: true, iso: false },
      },
      {
        name: 'Unverified Centre',
        area: 'Clement Town',
        address: '9 Clement Town, Dehradun',
        geo: { type: 'Point', coordinates: [78.0022, 30.2765] },
        priceMultiplier: 1.0,
        isVerified: false,
        turnaroundHrs: 10,
      },
    ]);
  });

  async function quote(body) {
    return request(app).post('/api/cart/quote').send(body);
  }

  it('prices a mixed cart of a package, a single test and a scan', async () => {
    const res = await quote({
      items: [pkg.slug, cbc.slug, ultrasound.slug],
      labCenterId: sunrise._id.toString(),
    });

    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.lines).toHaveLength(3);
    expect(data.lines.map((line) => line.category)).toEqual(['package', 'single', 'imaging']);
    expect(data.subtotal).toBe(1499 + 350 + 1200);
    expect(data.total).toBe(Math.round(3049 * 1.15));
  });

  it('produces exactly what the booking would charge', async () => {
    const res = await quote({
      items: [cbc.slug, vitaminD.slug],
      labCenterId: sunrise._id.toString(),
    });

    // Not "the same formula" — the same function, given the same inputs the
    // booking gives it. This is the assertion the endpoint exists for.
    const charged = calculateBookingPrice({
      tests: [cbc, vitaminD],
      packageItem: null,
      multiplier: 1.15,
    });

    expect(res.body.data.total).toBe(charged);
  });

  it('rounds once over the basket, not once per line', async () => {
    const res = await quote({
      items: [sugar.slug, urine.slug],
      labCenterId: sunrise._id.toString(),
    });

    // Math.round((99 + 104) * 1.15) = 233.
    // Math.round(99 * 1.15) + Math.round(104 * 1.15) = 114 + 120 = 234.
    //
    // These particular prices matter. The divergence is a single rupee and
    // floating point decides where it falls — 350 and 250 at this same
    // multiplier agree at 690, so a test built on those passes whichever
    // strategy the service uses and proves nothing. A quote a rupee off the
    // debit is, to a patient, indistinguishable from being overcharged.
    expect(res.body.data.total).toBe(233);
    expect(res.body.data.total).not.toBe(234);
  });

  it('agrees with the booking price across every basket in the catalogue', async () => {
    // A property, not an example: whatever the service does, it must land on
    // the number createBooking charges. This is what stops the two drifting
    // apart the next time either is touched.
    const catalogue = [pkg, cbc, vitaminD, sugar, urine];
    const labs = [
      { lab: sunrise, multiplier: 1.15 },
      { lab: doonPath, multiplier: 0.92 },
    ];

    for (const { lab, multiplier } of labs) {
      for (let i = 0; i < catalogue.length; i += 1) {
        for (let j = i + 1; j < catalogue.length; j += 1) {
          const pair = [catalogue[i], catalogue[j]];
          const res = await quote({
            items: pair.map((item) => item.slug),
            labCenterId: lab._id.toString(),
          });

          expect(res.body.data.total).toBe(
            calculateBookingPrice({ tests: pair, packageItem: null, multiplier })
          );
        }
      }
    }
  });

  it('shows an adjustment that makes the column add up', async () => {
    const res = await quote({
      items: [pkg.slug, ultrasound.slug],
      labCenterId: doonPath._id.toString(),
    });

    const { subtotal, labAdjustment, total } = res.body.data;
    // By construction, not by coincidence: the adjustment is derived from the
    // total. A patient reading the lines must arrive at what they pay.
    expect(subtotal + labAdjustment).toBe(total);
    // Doon Path is cheaper, so the adjustment is a discount.
    expect(labAdjustment).toBeLessThan(0);
  });

  it('prices the same basket differently at different labs', async () => {
    const items = [cbc.slug, vitaminD.slug];
    const atSunrise = await quote({ items, labCenterId: sunrise._id.toString() });
    const atDoon = await quote({ items, labCenterId: doonPath._id.toString() });

    expect(atSunrise.body.data.total).toBe(690);
    expect(atDoon.body.data.total).toBe(Math.round(600 * 0.92));
    expect(atSunrise.body.data.total).not.toBe(atDoon.body.data.total);
  });

  it('returns no total at all until a lab is chosen', async () => {
    const res = await quote({ items: [cbc.slug, vitaminD.slug] });

    expect(res.status).toBe(200);
    // The subtotal presented as the price would be an invented number: the
    // same test genuinely costs different amounts at different centres.
    expect(res.body.data.total).toBeNull();
    expect(res.body.data.totalPending).toBe(true);
    expect(res.body.data.subtotal).toBe(600);
    expect(res.body.data.totalPendingReason).toMatch(/choose a lab/i);
  });

  it('makes the whole basket a lab visit when it holds a scan, and says why', async () => {
    const res = await quote({
      items: [cbc.slug, ultrasound.slug],
      labCenterId: sunrise._id.toString(),
    });

    // One booking, one mode.
    expect(res.body.data.mode).toBe('visit');
    expect(res.body.data.modeReason).toMatch(/Ultrasound — Whole Abdomen/);
    expect(res.body.data.modeReason).toMatch(/lab visit/i);
    expect(res.body.data.visitOnlyItems).toEqual([ultrasound.slug]);
  });

  it('stays a home collection when nothing needs the lab', async () => {
    const res = await quote({
      items: [pkg.slug, cbc.slug],
      labCenterId: sunrise._id.toString(),
    });

    expect(res.body.data.mode).toBe('home');
    expect(res.body.data.modeReason).toBeNull();
    expect(res.body.data.visitOnlyItems).toEqual([]);
  });

  it('quotes the slowest turnaround in the basket', async () => {
    const res = await quote({
      items: [pkg.slug, ultrasound.slug],
      labCenterId: sunrise._id.toString(),
    });

    // The booking is done when the last result is in: 48h, not the package's 8.
    expect(res.body.data.turnaroundHrs).toBe(48);
  });

  it('warns when a package sits alongside other tests, without dropping either', async () => {
    const res = await quote({
      items: [pkg.slug, cbc.slug],
      labCenterId: sunrise._id.toString(),
    });

    // We cannot tell whether the package's "CBC (24)" is this CBC, so we
    // neither drop a line nor stay quiet — both lines are charged and the
    // patient is told what to check.
    //
    // It leads with the benefit, because adding a test the checkup does NOT
    // cover is the intended use of the basket: one visit, one payment. A
    // message that reads as a warning against doing that works against the
    // feature it is attached to.
    expect(res.body.data.overlapWarning).toMatch(/one visit/i);
    expect(res.body.data.overlapWarning).toMatch(/paid for once/i);
    expect(res.body.data.overlapWarning).toMatch(/charged again/i);
    // It names the package, so the patient knows what to check against.
    expect(res.body.data.overlapWarning).toContain('Full Body Checkup');
    expect(res.body.data.lines).toHaveLength(2);
    expect(res.body.data.subtotal).toBe(1499 + 350);
  });

  it('says nothing about overlap when there is no package', async () => {
    const res = await quote({
      items: [cbc.slug, vitaminD.slug],
      labCenterId: sunrise._id.toString(),
    });

    expect(res.body.data.overlapWarning).toBeNull();
  });

  it('charges once for an item sent twice, by slug and by id', async () => {
    const res = await quote({
      items: [cbc.slug, cbc._id.toString()],
      labCenterId: sunrise._id.toString(),
    });

    // The same catalogue row arriving in two notations is a client bug, not a
    // decision to buy two.
    expect(res.body.data.lines).toHaveLength(1);
    expect(res.body.data.subtotal).toBe(350);
  });

  it('accepts ids as readily as slugs', async () => {
    const res = await quote({
      items: [cbc._id.toString(), vitaminD._id.toString()],
      labCenterId: sunrise._id.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(690);
  });

  it('rejects an item that is not in the catalogue', async () => {
    const res = await quote({
      items: [cbc.slug, 'not-a-real-test'],
      labCenterId: sunrise._id.toString(),
    });

    // No partial quote: pricing three of the four things someone selected, at
    // a total they did not intend, is worse than failing.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TEST_NOT_FOUND');
    expect(res.body.data).toBeUndefined();
  });

  it('refuses to price at an unverified centre', async () => {
    const res = await quote({
      items: [cbc.slug],
      labCenterId: unverifiedLab._id.toString(),
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LAB_NOT_AVAILABLE');
  });

  it('refuses an empty cart', async () => {
    const res = await quote({ items: [] });
    expect(res.status).toBe(400);
  });

  it('never accepts a price from the caller', async () => {
    const res = await quote({
      items: [cbc.slug],
      labCenterId: sunrise._id.toString(),
      // A caller proposing what they pay is the defect CONTEXT §3.2 exists for.
      total: 1,
      subtotal: 1,
      basePrice: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.subtotal).toBe(350);
    expect(res.body.data.total).toBe(Math.round(350 * 1.15));
  });

  it('does not require a signed-in patient', async () => {
    // Building a basket before you have an account is the normal path.
    const res = await quote({ items: [cbc.slug] });
    expect(res.status).toBe(200);
  });
});

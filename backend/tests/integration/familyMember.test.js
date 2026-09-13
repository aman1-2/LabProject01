import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import { FamilyMember } from '../../src/schemas/FamilyMember.js';
import Booking from '../../src/schemas/Booking.js';
import Address from '../../src/schemas/Address.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Report from '../../src/schemas/Report.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import s3Storage from '../../src/utils/s3StorageService.js';

describe('Family Member & Booking Integration Tests', () => {

/**
 * Home collection requires a collection address — the rider has to know where
 * to go. Created through the API with the SAME token as the booking, so the
 * address is owned by the caller and the server's ownership check passes.
 */
async function addressFor(token) {
  const res = await request(app)
    .post('/api/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Home',
      line: '14 Rajpur Road, Dehradun',
      pincode: '248001',
      lat: 30.3165,
      lng: 78.0322,
    });
  return res.body.data._id;
}
  let mongoServer;
  let app;
  let userA;
  let userB;
  let tokenA;
  let tokenB;
  let lab;
  let testItem;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_fam_test' } });
      const uri = mongoServer.getUri();
      await connectDB(uri);
    } catch {
      await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/pathcare_fam_test');
    }
    app = createApp();
  });

  afterAll(async () => {
    await FamilyMember.deleteMany({});
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await Report.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await FamilyMember.deleteMany({});
    await Booking.deleteMany({});
    await Address.deleteMany({});
    await Report.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});

    userA = await User.create({
      accountHandle: 'usera_fam',
      phone: '9876543210',
      name: 'User Alpha',
      passwordHash: 'test_hash_usera',
      accountType: 'single',
      role: 'patient',
      location: { lat: 12.9716, lng: 77.5946, address: 'Bangalore Central', source: 'manual' },
    });

    userB = await User.create({
      accountHandle: 'userb_fam',
      phone: '9876543211',
      name: 'User Beta',
      passwordHash: 'test_hash_userb',
      accountType: 'single',
      role: 'patient',
      location: { lat: 12.9716, lng: 77.5946, address: 'Bangalore East', source: 'manual' },
    });

    tokenA = generateAccessToken({ userId: userA._id.toString(), role: 'patient' });
    tokenB = generateAccessToken({ userId: userB._id.toString(), role: 'patient' });

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
      slug: 'cbc-test-fam',
      category: 'single',
      basePrice: 450,
      turnaroundHrs: 12,
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      description: 'Measures blood cells and hemoglobin.',
      prepInstructions: 'No fasting required.',
      active: true,
    });
  });

  describe('Account Conversion & CRUD', () => {
    it('adding a member to a single account converts it to family automatically', async () => {
      // Pre-condition: userA is 'single'
      const preUser = await User.findById(userA._id);
      expect(preUser.accountType).toBe('single');

      // Add family member
      const res = await request(app)
        .post('/api/family-members')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Sunita Sharma',
          relation: 'Mother',
          age: 58,
          gender: 'female',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Sunita Sharma');
      expect(res.body.data.relation).toBe('Mother');
      expect(res.body.data.age).toBe(58);
      expect(res.body.data.gender).toBe('female');
      expect(res.body.accountType).toBe('family');

      // Check DB user accountType
      const postUser = await User.findById(userA._id);
      expect(postUser.accountType).toBe('family');
    });

    it('user A cannot access, update, or delete user B family members (returns 404)', async () => {
      // Create member belonging to user B
      const memberB = await FamilyMember.create({
        ownerId: userB._id,
        name: 'Rohan Beta',
        relation: 'Brother',
        age: 25,
        gender: 'male',
      });

      // User A tries to GET User B's member
      const getRes = await request(app)
        .get(`/api/family-members/${memberB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(getRes.status).toBe(404);
      expect(getRes.body.error?.code).toBe('FAMILY_MEMBER_NOT_FOUND');

      // User A tries to UPDATE User B's member
      const patchRes = await request(app)
        .patch(`/api/family-members/${memberB._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hacked Name' });

      expect(patchRes.status).toBe(404);

      // User A tries to DELETE User B's member
      const delRes = await request(app)
        .delete(`/api/family-members/${memberB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(delRes.status).toBe(404);

      // Verify memberB was NOT deleted
      const checkMember = await FamilyMember.findById(memberB._id);
      expect(checkMember).not.toBeNull();
      expect(checkMember.name).toBe('Rohan Beta');
    });

    it('user A cannot see user B members in list', async () => {
      await FamilyMember.create({
        ownerId: userB._id,
        name: 'Secret Relative',
        relation: 'Spouse',
        age: 30,
        gender: 'female',
      });

      const res = await request(app)
        .get('/api/family-members')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Booking with Family Member', () => {
    // The storage layer no longer invents presigned URLs (HIGH H8).
    beforeEach(() => {
      jest
        .spyOn(s3Storage, 'generateReportDownloadUrl')
        .mockResolvedValue(
          'https://pathcare-reports-private.s3.ap-south-1.amazonaws.com/reports/stub.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=stubsig'
        );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('booking for a family member associates correctly and report is visible to account owner', async () => {
      // 1. Add family member for User A
      const famRes = await request(app)
        .post('/api/family-members')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Sunita Sharma',
          relation: 'Mother',
          age: 58,
          gender: 'female',
        });
      const memberId = famRes.body.data._id;

      // 2. Book test for family member
      const bookingRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', 'fam-booking-key-001')
        .send({
          familyMemberId: memberId,
          testIds: [testItem._id.toString()],
          labCenterId: lab._id.toString(),
          mode: 'visit',
          slotDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          paymentMode: 'cash',
        });

      expect(bookingRes.status).toBe(201);
      expect(bookingRes.body.success).toBe(true);
      const returnedFamId = bookingRes.body.data.familyMemberId?._id || bookingRes.body.data.familyMemberId;
      expect(returnedFamId.toString()).toBe(memberId.toString());
      expect(bookingRes.body.data.patientId).toBe(userA._id.toString());

      const bookingId = bookingRes.body.data._id;

      // 3. Create report for this booking
      await Report.create({
        bookingId,
        authoredBy: new mongoose.Types.ObjectId(),
        pdfUrl: 'https://pathcare-reports.s3.amazonaws.com/test-report.pdf',
        pdfKey: 'reports/test-report.pdf',
        summaryHtml: '<p>All parameters normal.</p>',
        editLog: [{ editedBy: new mongoose.Types.ObjectId(), editedAt: new Date(), changeReason: 'Initial creation' }],
      });

      // The report view is gated on payment, and this cash booking is still
      // `pending`. That is incidental here — this test is about attribution,
      // not money — so settle it explicitly rather than let an unrelated
      // precondition decide the result.
      await Booking.updateOne({ _id: bookingId }, { $set: { paymentStatus: 'paid' } });

      // 4. Verify account owner can view the report
      const reportRes = await request(app)
        .get(`/api/reports/${bookingId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(reportRes.status).toBe(200);
      expect(reportRes.body.success).toBe(true);
      expect(reportRes.body.data.bookingId.toString()).toBe(bookingId.toString());

      // 5. Verify User B CANNOT view this report (returns 404 per §3.2)
      const userBReportRes = await request(app)
        .get(`/api/reports/${bookingId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(userBReportRes.status).toBe(404);
    });

    it('booking for another users family member returns 404', async () => {
      // Member belonging to User B
      const memberB = await FamilyMember.create({
        ownerId: userB._id,
        name: 'Rohan Beta',
        relation: 'Brother',
        age: 25,
        gender: 'male',
      });

      // User A attempts to book using User B's familyMemberId
      const bookingRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', 'fam-booking-key-unowned')
        .send({
          familyMemberId: memberB._id.toString(),
          testIds: [testItem._id.toString()],
          labCenterId: lab._id.toString(),
          mode: 'visit',
          slotDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          paymentMode: 'cash',
        });

      expect(bookingRes.status).toBe(404);
      expect(bookingRes.body.error?.code).toBe('FAMILY_MEMBER_NOT_FOUND');
    });
  });
});

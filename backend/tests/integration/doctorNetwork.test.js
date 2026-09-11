import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import Doctor from '../../src/schemas/Doctor.js';
import Consultation from '../../src/schemas/Consultation.js';
import PartnerApplication from '../../src/schemas/PartnerApplication.js';
import Payment from '../../src/schemas/Payment.js';
import Booking from '../../src/schemas/Booking.js';
import Report from '../../src/schemas/Report.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';

describe('Doctor Network, Consultations & Partner Applications Integration', () => {
  let mongoServer;
  let app;
  let patientUser;
  let patientToken;
  let doctorUser;
  let doctorToken;
  let goldCardioDoc;
  let starterCardioDoc;
  let goldDermaDoc;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_doc_test' } });
      const uri = mongoServer.getUri();
      await connectDB(uri);
    } catch {
      await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/pathcare_doc_test');
    }
    app = createApp();
  });

  afterAll(async () => {
    await Doctor.deleteMany({});
    await Consultation.deleteMany({});
    await PartnerApplication.deleteMany({});
    await Payment.deleteMany({});
    await Booking.deleteMany({});
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
    await Doctor.deleteMany({});
    await Consultation.deleteMany({});
    await PartnerApplication.deleteMany({});
    await Payment.deleteMany({});
    await Booking.deleteMany({});
    await Report.deleteMany({});
    await User.deleteMany({});
    await LabCenter.deleteMany({});
    await TestCatalog.deleteMany({});

    // Create a patient user
    patientUser = await User.create({
      accountHandle: 'doc_patient_1',
      phone: '9876543210',
      name: 'Rohan Sharma',
      passwordHash: 'dummy_hash_1',
      accountType: 'single',
      role: 'patient',
      location: { lat: 12.9716, lng: 77.5946, address: 'Bangalore Central', source: 'manual' },
    });
    patientToken = generateAccessToken({ userId: patientUser._id.toString(), role: 'patient' });

    // Create a doctor user
    doctorUser = await User.create({
      accountHandle: 'dr_sharma_cardio',
      phone: '9876543211',
      name: 'Dr. Sunita Sharma',
      passwordHash: 'dummy_hash_2',
      accountType: 'single',
      role: 'doctor',
      location: { lat: 12.9716, lng: 77.5946, address: 'Indiranagar, Bangalore', source: 'manual' },
    });
    doctorToken = generateAccessToken({ userId: doctorUser._id.toString(), role: 'doctor' });

    // Create Doctor Profiles with different tiers & specialties
    // 1. Gold Cardio Doc (Linked to doctorUser)
    goldCardioDoc = await Doctor.create({
      userId: doctorUser._id,
      name: 'Dr. Sunita Sharma',
      qualification: 'MBBS, MD (Cardiology)',
      specialization: 'Cardiology',
      clinicName: 'Heart Care Clinic',
      clinicAddress: '42 MG Road, Indiranagar, Bangalore',
      consultationFee: 700,
      walkInFee: 800,
      experienceYears: 14,
      tier: 'Gold',
      isVerified: true,
      availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      consultationHours: '10:00 AM - 1:00 PM, 5:00 PM - 8:00 PM',
      about: 'Senior interventional cardiologist with over 14 years of clinical experience.',
    });

    // 2. Starter Cardio Doc
    starterCardioDoc = await Doctor.create({
      name: 'Dr. Aaron Patel',
      qualification: 'MBBS, DNB (Cardiology)',
      specialization: 'Cardiology',
      clinicName: 'Patel Heart Center',
      clinicAddress: '15 Brigade Road, Bangalore',
      consultationFee: 500,
      walkInFee: 600,
      experienceYears: 6,
      tier: 'Starter',
      isVerified: true,
      availableDays: ['Monday', 'Wednesday', 'Friday'],
      consultationHours: '11:00 AM - 2:00 PM',
      about: 'Clinical cardiologist focusing on preventive cardiology.',
    });

    // 3. Gold Derma Doc
    goldDermaDoc = await Doctor.create({
      name: 'Dr. Catherine Roy',
      qualification: 'MBBS, MD (Dermatology)',
      specialization: 'Dermatology',
      clinicName: 'Roy Skin Clinic',
      clinicAddress: '88 Koramangala 4th Block, Bangalore',
      consultationFee: 900,
      walkInFee: 1000,
      experienceYears: 11,
      tier: 'Gold',
      isVerified: true,
      availableDays: ['Tuesday', 'Thursday', 'Saturday'],
      consultationHours: '2:00 PM - 6:00 PM',
      about: 'Consultant dermatologist and cosmetologist.',
    });
  });

  describe('NMC Compliance: Zero Payment & Commission Prohibition', () => {
    it('books an appointment without any payment processing or payment gateway records', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const slotDateTime = new Date(`${tomorrow}T10:30:00.000Z`);

      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorId: goldCardioDoc._id.toString(),
          slotDateTime: slotDateTime.toISOString(),
          slotLabel: '10:30 AM',
          notes: 'Routine cardiovascular checkup',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const appt = res.body.data;
      expect(appt.doctorId._id || appt.doctorId).toBe(goldCardioDoc._id.toString());
      expect(appt.patientId).toBe(patientUser._id.toString());
      expect(appt.status).toBe('booked');
      expect(appt.slotLabel).toBe('10:30 AM');
      expect(appt.directPaymentNotice).toMatch(/pay.*directly at the clinic/i);

      // Verify STRICT Regulatory Invariants:
      // 1. No Payment records exist in the database
      const paymentCount = await Payment.countDocuments();
      expect(paymentCount).toBe(0);

      // 2. Consultation record has NO financial / commission / balance fields
      const dbConsultation = await Consultation.findById(appt._id).lean();
      expect(dbConsultation.amount).toBeUndefined();
      expect(dbConsultation.fee).toBeUndefined();
      expect(dbConsultation.commission).toBeUndefined();
      expect(dbConsultation.payout).toBeUndefined();
      expect(dbConsultation.balance).toBeUndefined();
      expect(dbConsultation.paymentStatus).toBeUndefined();
    });

    it('rejects booking with missing slot or doctor id', async () => {
      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          notes: 'Missing doctor and slot',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('lists patient appointments with doctor details', async () => {
      const slotDateTime = new Date(Date.now() + 86400000);
      await Consultation.create({
        doctorId: goldCardioDoc._id,
        patientId: patientUser._id,
        slotDateTime,
        slotLabel: '11:00 AM',
        status: 'booked',
      });

      const res = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].doctor.name).toBe('Dr. Sunita Sharma');
      expect(res.body.data[0].doctor.specialization).toBe('Cardiology');
    });
  });

  describe('Doctor Directory & Two-Stage Clinical Ranking', () => {
    it('ranks doctors by clinical match first, then by tier (Gold > Starter)', async () => {
      const res = await request(app).get('/api/doctors?specialty=Cardiology');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);

      // Gold cardiologist should come before Starter cardiologist
      expect(res.body.data[0].name).toBe('Dr. Sunita Sharma');
      expect(res.body.data[0].tier).toBe('Gold');
      expect(res.body.data[0].isFeatured).toBe(true);

      expect(res.body.data[1].name).toBe('Dr. Aaron Patel');
      expect(res.body.data[1].tier).toBe('Starter');
      expect(res.body.data[1].isFeatured).toBe(false);

      // Gold dermatologist must NOT be in the Cardiology result
      const hasDermatologist = res.body.data.some((d) => d.specialization === 'Dermatology');
      expect(hasDermatologist).toBe(false);
    });

    it('returns all doctors ordered by tier (Gold > Starter) when no specialty is specified', async () => {
      const res = await request(app).get('/api/doctors');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(3);

      // Top 2 should be the Gold tier doctors (Dr. Catherine Roy and Dr. Sunita Sharma)
      expect(['Gold']).toContain(res.body.data[0].tier);
      expect(['Gold']).toContain(res.body.data[1].tier);
      // Last should be Starter tier
      expect(res.body.data[2].tier).toBe('Starter');
    });

    it('lists distinct specialties for filter chips', async () => {
      const res = await request(app).get('/api/doctors/specialties');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(['Cardiology', 'Dermatology']);
    });

    it('returns a single doctor profile without any internal monetary/commission fields', async () => {
      const res = await request(app).get(`/api/doctors/${goldCardioDoc._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Dr. Sunita Sharma');
      expect(res.body.data.consultationFee).toBe(700);
      expect(res.body.data.walkInFee).toBe(800);
      expect(res.body.data.isFeatured).toBe(true);

      // Strict regulatory check on public profile
      expect(res.body.data.commission).toBeUndefined();
      expect(res.body.data.earnings).toBeUndefined();
      expect(res.body.data.balance).toBeUndefined();
      expect(res.body.data.payout).toBeUndefined();
    });
  });

  describe('Doctor Dashboard: Operational Counts Only (Zero Money)', () => {
    it('returns operational counts and zero monetary metrics', async () => {
      // Add a consultation for Dr. Sunita Sharma
      await Consultation.create({
        doctorId: goldCardioDoc._id,
        patientId: patientUser._id,
        slotDateTime: new Date(Date.now() + 86400000),
        slotLabel: '10:00 AM',
        status: 'booked',
        notes: 'Followup',
      });

      // Query both /api/doctors/dashboard and /api/doctor/dashboard
      const res = await request(app)
        .get('/api/doctor/dashboard')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.doctor.name).toBe('Dr. Sunita Sharma');
      expect(data.kpis).toBeDefined();
      expect(data.kpis.appointments).toBe(1);
      expect(typeof data.kpis.patientsReferred).toBe('number');
      expect(typeof data.kpis.reportsReady).toBe('number');
      expect(data.regulatoryNotice).toMatch(/PathCare takes no share.*never/i);

      // Strictly zero money fields in response
      expect(data.earnings).toBeUndefined();
      expect(data.revenue).toBeUndefined();
      expect(data.commission).toBeUndefined();
      expect(data.balance).toBeUndefined();
      expect(data.payout).toBeUndefined();
      expect(data.kpis.earnings).toBeUndefined();
      expect(data.kpis.revenue).toBeUndefined();
      expect(data.kpis.commission).toBeUndefined();
    });
  });

  describe('Partner Application Portal', () => {
    it('submits doctor partnership application successfully', async () => {
      const res = await request(app)
        .post('/api/partner/apply')
        .send({
          type: 'doctor',
          name: 'Dr. Vivek Verma',
          regNumber: 'KMC-54321',
          facilityName: 'Verma Ortho Clinic',
          specialityOrServices: 'Orthopaedics',
          area: 'Jayanagar, Bangalore',
          phone: '9811223344',
          notes: 'Interested in digital report integration and partner network.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('doctor');
      expect(res.body.data.status).toBe('received');
      expect(res.body.data.callbackPromise).toMatch(/2 working days/i);

      const appInDb = await PartnerApplication.findOne({ regNumber: 'KMC-54321' });
      expect(appInDb).not.toBeNull();
      expect(appInDb.name).toBe('Dr. Vivek Verma');
    });

    it('submits lab partnership application successfully', async () => {
      const res = await request(app)
        .post('/api/partner/apply')
        .send({
          type: 'lab',
          name: 'Apex Clinical Laboratory',
          facilityName: 'Apex Diagnostics Lab',
          specialityOrServices: 'Biochemistry, Haematology, Microbiology',
          area: 'Whitefield, Bangalore',
          phone: '9822334455',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('lab');
      expect(res.body.data.status).toBe('received');
    });

    it('rejects invalid partner type', async () => {
      const res = await request(app)
        .post('/api/partner/apply')
        .send({
          type: 'pharmacy',
          name: 'Pharmacy Store',
          facilityName: 'Pharmacy Store',
          specialityOrServices: 'Medicines',
          area: 'Indiranagar',
          phone: '9811111111',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
  // -- BLOCKER #5 regression --------------------------------------------------
  // GET /api/doctors/dashboard was gated on isAuthenticated only, took doctorId
  // straight from the query string, and fell back to the FIRST ACTIVE DOCTOR
  // when a lookup failed. Any authenticated user could read any doctor's
  // referred-patient list, including patient names and phone numbers.
  describe('BLOCKER #5 -- doctor dashboard is scoped to the authenticated doctor', () => {
    it('refuses a patient outright', async () => {
      const res = await request(app)
        .get('/api/doctor/dashboard')
        .set('Authorization', `Bearer ${patientToken}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();
    });

    it('refuses a patient even when they name a real doctorId', async () => {
      const res = await request(app)
        .get(`/api/doctor/dashboard?doctorId=${goldCardioDoc._id}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.data).toBeUndefined();
    });

    it('ignores a doctorId naming ANOTHER doctor and returns the caller own dashboard', async () => {
      const res = await request(app)
        .get(`/api/doctor/dashboard?doctorId=${starterCardioDoc._id}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      // Resolved from the token, not the query string.
      expect(res.body.data.doctor._id).toBe(goldCardioDoc._id.toString());
      expect(res.body.data.doctor._id).not.toBe(starterCardioDoc._id.toString());
    });

    it('does not fall back to another doctor when the caller has no doctor profile', async () => {
      const orphanDoctorUser = await User.create({
        accountHandle: `orphan_doctor_${Date.now()}`,
        phone: `95${Date.now().toString().slice(-8)}`,
        name: 'Dr Unlinked',
        passwordHash: 'dummy_hash',
        role: 'doctor',
        location: { lat: 30.3165, lng: 78.0322, address: 'Dehradun' },
      });
      const orphanToken = generateAccessToken({
        userId: orphanDoctorUser._id.toString(),
        role: 'doctor',
      });

      const res = await request(app)
        .get('/api/doctor/dashboard')
        .set('Authorization', `Bearer ${orphanToken}`);

      // Previously: served the first active doctor's patient list.
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCTOR_NOT_FOUND');
      expect(res.body.data).toBeUndefined();
    });

    it('never leaks another doctor patient names to an unrelated doctor', async () => {
      const otherDoctorUser = await User.create({
        accountHandle: `other_doctor_${Date.now()}`,
        phone: `96${Date.now().toString().slice(-8)}`,
        name: 'Dr Unrelated',
        passwordHash: 'dummy_hash',
        role: 'doctor',
        location: { lat: 30.3165, lng: 78.0322, address: 'Dehradun' },
      });
      const otherDoc = await Doctor.create({
        userId: otherDoctorUser._id,
        name: 'Dr. Unrelated Physician',
        qualification: 'MBBS',
        specialization: 'General Medicine',
        clinicName: 'Unrelated Clinic',
        clinicAddress: '1 Nowhere Road, Dehradun',
        consultationFee: 400,
        walkInFee: 500,
        tier: 'Starter',
        isVerified: true,
      });
      const otherToken = generateAccessToken({
        userId: otherDoctorUser._id.toString(),
        role: 'doctor',
      });

      const res = await request(app)
        .get(`/api/doctor/dashboard?doctorId=${goldCardioDoc._id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.doctor._id).toBe(otherDoc._id.toString());
      // Their own dashboard is empty; none of the gold doctor referrals leak.
      expect(res.body.data.referredBookings).toEqual([]);
    });
  });
});

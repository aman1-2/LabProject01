import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import { User } from '../../src/schemas/User.js';
import { Doctor } from '../../src/schemas/Doctor.js';
import { Rider } from '../../src/schemas/Rider.js';
import { LabCenter } from '../../src/schemas/LabCenter.js';
import { generateStaffPassword } from '../../src/services/staffProvisioningService.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';

/**
 * The super admin creating staff accounts.
 *
 * Onboarding a phlebotomist used to require a shell on the server. This is the
 * console path for it, and because it mints credentials for accounts that can
 * read patient data, the assertions worth having are mostly about what it
 * REFUSES:
 *
 *   - only a super admin may call it;
 *   - it will not create another super admin, however it is asked;
 *   - the caller never chooses the password, and never gets it twice;
 *   - a staff member cannot work until they replace the password their admin
 *     can see — enforced by the server, not the interface.
 */
describe('Super-admin staff provisioning', () => {
  let mongoServer;
  let app;
  let admin;
  let adminToken;
  let patient;
  let patientToken;
  let labCentre;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_staff_test' } });
    await connectDB(mongoServer.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDB();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    resetRateLimitStore();
    await Promise.all([
      User.deleteMany({}),
      Doctor.deleteMany({}),
      Rider.deleteMany({}),
      LabCenter.deleteMany({}),
    ]);

    const passwordHash = await bcrypt.hash('AdminPassword1', 10);

    admin = await User.create({
      accountHandle: 'super_admin_one',
      name: 'Admin One',
      phone: '9800000101',
      passwordHash,
      role: 'super_admin',
      isVerified: true,
    });
    adminToken = generateAccessToken(admin);

    patient = await User.create({
      accountHandle: 'patient_one',
      name: 'Patient One',
      phone: '9800000102',
      passwordHash,
      role: 'patient',
      isVerified: true,
      // A patient genuinely has a collection address, and the schema requires
      // one for exactly that reason.
      location: { lat: 30.3165, lng: 78.0322, address: '4 Rajpur Road, Dehradun', source: 'manual' },
    });
    patientToken = generateAccessToken(patient);

    labCentre = await LabCenter.create({
      name: 'Sunrise Diagnostics',
      area: 'Rajpur Road',
      address: '12 Rajpur Road, Dehradun',
      geo: { type: 'Point', coordinates: [78.0322, 30.3165] },
      priceMultiplier: 1.0,
      isVerified: true,
      turnaroundHrs: 6,
    });
  });

  const asAdmin = (path) =>
    request(app).post(path).set('Authorization', `Bearer ${adminToken}`);

  const DOCTOR = {
    accountHandle: 'dr_mehta',
    name: 'Dr A Mehta',
    phone: '9800000201',
    specialization: 'Internal Medicine',
    clinicName: 'Doon Clinic',
    consultationFee: 500,
    walkInFee: 700,
  };

  // ── Who may call this at all ────────────────────────────────────────────
  it('refuses a patient, even a signed-in one', async () => {
    const res = await request(app)
      .post('/api/admin/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(DOCTOR);

    expect(res.status).toBe(403);
    expect(await User.findOne({ accountHandle: DOCTOR.accountHandle })).toBeNull();
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await request(app).post('/api/admin/doctors').send(DOCTOR);
    expect(res.status).toBe(401);
  });

  // ── Doctors ─────────────────────────────────────────────────────────────
  it('creates a doctor and returns the password exactly once', async () => {
    const res = await asAdmin('/api/admin/doctors').send(DOCTOR);

    expect(res.status).toBe(201);
    const { credentials, doctor } = res.body.data;

    expect(credentials.accountHandle).toBe('dr_mehta');
    expect(typeof credentials.password).toBe('string');
    expect(credentials.password.length).toBeGreaterThanOrEqual(12);
    expect(credentials.mustChangePassword).toBe(true);
    expect(doctor.specialization).toBe('Internal Medicine');

    // Stored only as a hash. A password retrievable later is a password
    // waiting in a database to leak.
    const created = await User.findOne({ accountHandle: 'dr_mehta' });
    expect(created.passwordHash).not.toBe(credentials.password);
    expect(await bcrypt.compare(credentials.password, created.passwordHash)).toBe(true);
    expect(created.mustChangePassword).toBe(true);

    // And no endpoint hands it back.
    const list = await request(app)
      .get('/api/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(JSON.stringify(list.body)).not.toContain(credentials.password);
  });

  it('records which admin created the account', async () => {
    await asAdmin('/api/admin/doctors').send(DOCTOR);

    const created = await User.findOne({ accountHandle: 'dr_mehta' });
    // Taken from the token, never the body — otherwise the audit trail is
    // whatever the caller claims it is.
    expect(String(created.createdBy)).toBe(String(admin._id));
  });

  it('ignores a createdBy the caller tries to supply', async () => {
    await asAdmin('/api/admin/doctors').send({ ...DOCTOR, createdBy: String(patient._id) });

    const created = await User.findOne({ accountHandle: 'dr_mehta' });
    expect(String(created.createdBy)).toBe(String(admin._id));
  });

  it('creates a doctor invisible to patients until verified', async () => {
    await asAdmin('/api/admin/doctors').send(DOCTOR);

    const doctor = await Doctor.findOne({ name: 'Dr A Mehta' });
    // The directory lists active doctors only. Creating a doctor is not
    // endorsing one.
    expect(doctor.isActive).toBe(false);
    expect(doctor.isVerified).toBe(false);

    const directory = await request(app).get('/api/doctors');
    expect(JSON.stringify(directory.body)).not.toContain('Dr A Mehta');
  });

  it('will not accept a password from the caller', async () => {
    const res = await asAdmin('/api/admin/doctors').send({
      ...DOCTOR,
      password: 'AdminChosen1',
    });

    expect(res.status).toBe(201);
    const created = await User.findOne({ accountHandle: 'dr_mehta' });
    // The admin's suggestion is not the account's password.
    expect(await bcrypt.compare('AdminChosen1', created.passwordHash)).toBe(false);
    expect(await bcrypt.compare(res.body.data.credentials.password, created.passwordHash)).toBe(
      true
    );
  });

  // ── Privilege escalation ────────────────────────────────────────────────
  it('will not create another super admin, however it is asked', async () => {
    // There is no endpoint for it; asking a doctor to be one must not work
    // either.
    const res = await asAdmin('/api/admin/doctors').send({ ...DOCTOR, role: 'super_admin' });

    expect(res.status).toBe(201);
    const created = await User.findOne({ accountHandle: 'dr_mehta' });
    // One stolen admin session must not become permanent admin access.
    expect(created.role).toBe('doctor');
    expect(await User.countDocuments({ role: 'super_admin' })).toBe(1);
  });

  // ── Riders ──────────────────────────────────────────────────────────────
  it('creates a phlebotomist attached to a centre, and offline', async () => {
    const res = await asAdmin('/api/admin/riders').send({
      accountHandle: 'rider_arjun',
      name: 'Arjun Mehta',
      phone: '9800000202',
      labCenterId: labCentre._id.toString(),
    });

    expect(res.status).toBe(201);
    const rider = await Rider.findOne({}).lean();
    expect(String(rider.labCenterId)).toBe(String(labCentre._id));
    // Not dispatchable the instant the account exists — nobody has handed them
    // a kit yet.
    expect(rider.status).toBe('offline');
  });

  it('refuses a rider for a centre that does not exist', async () => {
    const res = await asAdmin('/api/admin/riders').send({
      accountHandle: 'rider_ghost',
      name: 'Ghost Rider',
      phone: '9800000203',
      labCenterId: '6aa27de8d230951b8da13999',
    });

    expect(res.status).toBe(404);
    // And no half-made account left behind.
    expect(await User.findOne({ accountHandle: 'rider_ghost' })).toBeNull();
  });

  // ── Lab admins ──────────────────────────────────────────────────────────
  it('creates a lab desk login bound to its centre', async () => {
    const res = await asAdmin('/api/admin/lab-admins').send({
      accountHandle: 'lab_desk_one',
      name: 'Sunrise Desk',
      phone: '9800000204',
      labCenterId: labCentre._id.toString(),
    });

    expect(res.status).toBe(201);
    const created = await User.findOne({ accountHandle: 'lab_desk_one' });
    expect(created.role).toBe('lab_admin');
    // Without this the lab console opens on an empty queue with no explanation.
    expect(String(created.labCenterId)).toBe(String(labCentre._id));
  });

  // ── Lab centres ─────────────────────────────────────────────────────────
  it('creates a lab centre, unverified', async () => {
    const res = await asAdmin('/api/admin/labs').send({
      name: 'New Centre',
      area: 'Clement Town',
      address: '9 Clement Town, Dehradun',
      lat: 30.2765,
      lng: 78.0022,
      priceMultiplier: 1.1,
    });

    expect(res.status).toBe(201);
    // A centre cannot take bookings until someone verifies it; creating it is
    // not verifying it.
    expect(res.body.data.lab.isVerified).toBe(false);
  });

  it('refuses a price multiplier that would multiply every bill', async () => {
    const res = await asAdmin('/api/admin/labs').send({
      name: 'Typo Centre',
      area: 'Clement Town',
      address: '9 Clement Town, Dehradun',
      lat: 30.2765,
      lng: 78.0022,
      // 15 typed for 1.5 — a ten-fold overcharge on every test at this centre.
      priceMultiplier: 15,
    });

    expect(res.status).toBe(400);
    expect(await LabCenter.findOne({ name: 'Typo Centre' })).toBeNull();
  });

  it('refuses a duplicate handle without creating anything', async () => {
    await asAdmin('/api/admin/doctors').send(DOCTOR);
    const res = await asAdmin('/api/admin/doctors').send({
      ...DOCTOR,
      phone: '9800000209',
    });

    expect(res.status).toBe(409);
    expect(await User.countDocuments({ accountHandle: 'dr_mehta' })).toBe(1);
  });

  // ── The forced password change ──────────────────────────────────────────
  describe('a staff member who has not chosen their own password', () => {
    let staffToken;
    let issuedPassword;

    beforeEach(async () => {
      const res = await asAdmin('/api/admin/riders').send({
        accountHandle: 'rider_new',
        name: 'New Rider',
        phone: '9800000205',
        labCenterId: labCentre._id.toString(),
      });
      issuedPassword = res.body.data.credentials.password;
      const staff = await User.findOne({ accountHandle: 'rider_new' });
      staffToken = generateAccessToken(staff);
    });

    it('can sign in with the issued password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ accountHandle: 'rider_new', password: issuedPassword });

      expect(res.status).toBe(200);
    });

    it('is blocked from working until they change it', async () => {
      const res = await request(app)
        .get('/api/rider/me')
        .set('Authorization', `Bearer ${staffToken}`);

      // Server-side. The interface is not the thing standing in the way.
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('can still reach the endpoint that changes it', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ currentPassword: issuedPassword, newPassword: 'MyOwnPassword9' });

      expect(res.status).toBe(200);
    });

    it('can work once they have', async () => {
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ currentPassword: issuedPassword, newPassword: 'MyOwnPassword9' });

      const res = await request(app)
        .get('/api/rider/me')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).not.toBe(403);
      const staff = await User.findOne({ accountHandle: 'rider_new' });
      expect(staff.mustChangePassword).toBe(false);
    });

    it('cannot satisfy the requirement by retyping the admin’s password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ currentPassword: issuedPassword, newPassword: issuedPassword });

      // Otherwise the password the admin read off the screen keeps working.
      expect(res.status).toBe(422);
      const staff = await User.findOne({ accountHandle: 'rider_new' });
      expect(staff.mustChangePassword).toBe(true);
    });

    it('cannot change it without knowing the current one', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ currentPassword: 'NotThePassword1', newPassword: 'MyOwnPassword9' });

      // An unattended session should not be enough to lock the owner out.
      expect(res.status).toBe(401);
    });

    it('cannot set a password weaker than signup would allow', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ currentPassword: issuedPassword, newPassword: 'short' });

      expect(res.status).toBe(400);
    });

    it('the admin’s copy stops working after the change', async () => {
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ currentPassword: issuedPassword, newPassword: 'MyOwnPassword9' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ accountHandle: 'rider_new', password: issuedPassword });

      // This is the whole point of the forced change.
      expect(res.status).toBe(401);
    });
  });

  // ── The generator ───────────────────────────────────────────────────────
  describe('generated passwords', () => {
    it('are different every time', () => {
      const seen = new Set();
      for (let i = 0; i < 200; i += 1) seen.add(generateStaffPassword());
      // Math.random seeded per tick would collide here.
      expect(seen.size).toBe(200);
    });

    it('always satisfy the password rules', () => {
      for (let i = 0; i < 100; i += 1) {
        const password = generateStaffPassword();
        expect(password.length).toBeGreaterThanOrEqual(14);
        expect(password).toMatch(/[A-Za-z]/);
        expect(password).toMatch(/[0-9]/);
      }
    });

    it('avoid characters that are misread when read aloud', () => {
      for (let i = 0; i < 100; i += 1) {
        // O/0 and l/1/I cause login failures that are really transcription
        // errors, and those are miserable to debug over the phone.
        expect(generateStaffPassword()).not.toMatch(/[O0lI1]/);
      }
    });
  });
});

/**
 * Provision a staff account — super_admin, lab_admin, or doctor.
 *
 * There is no API for this, by design. `authService` hardcodes
 * `role: 'patient'` on every signup, so an account that can reach the admin
 * console, the lab console or the doctor dashboard cannot be created through
 * the product at all. This is the operator tool that fills that gap, and it is
 * the sibling of provisionRider.js.
 *
 * It is NOT seed data. It creates ONE account from details you supply, invents
 * nothing (CONTEXT §11), and refuses to run against production.
 *
 *   node src/scripts/provisionStaff.js --role super_admin \
 *     --handle admin.aman --phone 9800000001 --name "Aman Pratap Singh" \
 *     --password 'SomethingStrong1'
 *
 *   node src/scripts/provisionStaff.js --role lab_admin \
 *     --handle lab.sunrise --phone 9800000002 --name "Sunrise Lab Desk" \
 *     --password 'SomethingStrong1' --lab "Sunrise Diagnostics"
 *
 *   node src/scripts/provisionStaff.js --role doctor \
 *     --handle dr.sharma --phone 9800000003 --name "Dr S Sharma" \
 *     --password 'SomethingStrong1' \
 *     --specialization "Internal Medicine" --clinic "Doon Clinic" \
 *     --fee 500 --walkInFee 700
 *
 * A doctor is created INACTIVE unless --activate is passed. The patient-facing
 * directory lists `isActive: true` only, so a development login cannot appear
 * to patients as a real doctor they might try to book.
 *
 * Re-running with the same handle updates that account rather than erroring,
 * so it is safe to re-run after a password change.
 */
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { connectDB, disconnectDB } from '../config/dbConfig.js';
import { User } from '../schemas/User.js';
import { Doctor } from '../schemas/Doctor.js';
import { LabCenter } from '../schemas/LabCenter.js';
import { passwordSchema, phoneSchema, accountHandleSchema } from '@pathcare/validators';
import logger from '../utils/logger.js';

dotenv.config();

const ROLES = ['super_admin', 'lab_admin', 'doctor'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith('--') ? next : 'true';
  }
  return args;
}

export async function provisionStaff({
  role,
  handle,
  phone,
  name,
  password,
  labName = null,
  specialization = null,
  clinicName = null,
  consultationFee = null,
  walkInFee = null,
  qualification = null,
  activate = false,
  allowProduction = false,
}) {
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error(
      'Refusing to provision a staff account against a production database. ' +
        'Production staff are created with verified identity, not from a script.'
    );
  }

  if (!ROLES.includes(role)) {
    throw new Error(`--role must be one of: ${ROLES.join(', ')}`);
  }

  // Validated with the same schemas the API uses, so a script-made account
  // cannot be weaker than one made through signup.
  const cleanHandle = accountHandleSchema.parse(String(handle || '').toLowerCase().trim());
  const cleanPhone = phoneSchema.parse(String(phone || '').trim());
  passwordSchema.parse(String(password || ''));

  if (!name || !String(name).trim()) {
    throw new Error('--name is required');
  }

  // A lab_admin who belongs to no centre can open the lab console and see an
  // empty queue with no explanation, so the link is required up front.
  let labCenter = null;
  if (role === 'lab_admin') {
    if (!labName) throw new Error('--lab is required for a lab_admin');
    labCenter = await LabCenter.findOne({ name: new RegExp(`^${labName}$`, 'i') });
    if (!labCenter) {
      const known = (await LabCenter.find({}, 'name').lean()).map((l) => l.name);
      throw new Error(
        `No lab centre named "${labName}". Known centres: ${known.join(', ') || '(none)'}`
      );
    }
  }

  if (role === 'doctor') {
    for (const [flag, value] of [
      ['--specialization', specialization],
      ['--clinic', clinicName],
      ['--fee', consultationFee],
      ['--walkInFee', walkInFee],
    ]) {
      if (value === null || value === undefined || value === '') {
        throw new Error(`${flag} is required for a doctor — this script invents no clinical detail`);
      }
    }
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const user = await User.findOneAndUpdate(
    { accountHandle: cleanHandle },
    {
      $set: {
        accountHandle: cleanHandle,
        name: String(name).trim(),
        phone: cleanPhone,
        passwordHash,
        role,
        isVerified: true,
        ...(labCenter ? { labCenterId: labCenter._id } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  let doctor = null;
  if (role === 'doctor') {
    const fields = {
      userId: user._id,
      name: String(name).trim(),
      specialization: String(specialization).trim(),
      clinicName: String(clinicName).trim(),
      consultationFee: Number(consultationFee),
      walkInFee: Number(walkInFee),
      phone: cleanPhone,
      ...(qualification ? { qualification: String(qualification).trim() } : {}),
      // Inactive by default: the patient-facing directory lists active doctors
      // only, so a development account stays invisible to patients until
      // someone deliberately turns it on with real details.
      isActive: Boolean(activate),
      isVerified: false,
    };

    // Find-then-save rather than an upsert. `clinicAddress` defaults through a
    // function that reads `this.clinicName`, and on an upsert `this` is not a
    // document — the default never resolves and the insert produces nothing.
    doctor = await Doctor.findOne({ userId: user._id });
    if (doctor) {
      doctor.set(fields);
      await doctor.save();
    } else {
      doctor = await Doctor.create(fields);
    }
  }

  logger.info('Staff account provisioned', {
    role,
    accountHandle: user.accountHandle,
    userId: user._id.toString(),
    ...(labCenter ? { labCentre: labCenter.name } : {}),
    ...(doctor ? { doctorId: doctor._id.toString(), isActive: doctor.isActive } : {}),
  });

  return { user, doctor, labCenter };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.role || !args.handle || !args.phone || !args.name || !args.password) {
    console.error(
      'usage: node src/scripts/provisionStaff.js --role <super_admin|lab_admin|doctor> \\\n' +
        '         --handle <handle> --phone <10 digits> --name "<full name>" --password <password>\n' +
        '       lab_admin also needs --lab "<centre name>"\n' +
        '       doctor also needs --specialization --clinic --fee --walkInFee [--activate]'
    );
    process.exitCode = 1;
    return;
  }

  await connectDB(process.env.MONGODB_URI);

  try {
    const { user, doctor, labCenter } = await provisionStaff({
      role: args.role,
      handle: args.handle,
      phone: args.phone,
      name: args.name,
      password: args.password,
      labName: args.lab ?? null,
      specialization: args.specialization ?? null,
      clinicName: args.clinic ?? null,
      consultationFee: args.fee ?? null,
      walkInFee: args.walkInFee ?? null,
      qualification: args.qualification ?? null,
      activate: args.activate === 'true',
      allowProduction: args.allowProduction === 'true',
    });

    console.log(`\n  ${user.role} ready`);
    console.log(`    handle : ${user.accountHandle}`);
    console.log(`    phone  : ${user.phone}`);
    if (labCenter) console.log(`    centre : ${labCenter.name}`);
    if (doctor) {
      console.log(`    clinic : ${doctor.clinicName} (${doctor.specialization})`);
      console.log(`    listed : ${doctor.isActive ? 'YES — visible to patients' : 'no (inactive)'}`);
    }
    console.log('    The password is the one you passed on the command line.\n');
  } catch (error) {
    console.error(`\n  Failed: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

// Only run when invoked directly, so the export stays importable by tests.
if (process.argv[1] && process.argv[1].endsWith('provisionStaff.js')) {
  main();
}

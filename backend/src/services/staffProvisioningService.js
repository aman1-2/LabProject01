// backend/src/services/staffProvisioningService.js
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { User } from '../schemas/User.js';
import { Doctor } from '../schemas/Doctor.js';
import { Rider } from '../schemas/Rider.js';
import { LabCenter } from '../schemas/LabCenter.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Making staff accounts.
 *
 * Doctors, lab desks and phlebotomists do not sign themselves up — `authService`
 * hardcodes `role: 'patient'` on every signup, deliberately. Someone has to
 * create these accounts, and that someone is the super admin. Until now the
 * only way was a shell on the server, which meant onboarding a phlebotomist
 * required a deploy-level credential.
 *
 * ONE IMPLEMENTATION, TWO FRONT DOORS
 *
 * The admin API and the CLI scripts both call this. Two copies of "make a
 * staff account" drift, and the way that shows up is an account created one
 * way missing a field the other sets — a rider with no centre, or a doctor
 * visible in the patient directory before anyone verified them.
 *
 * THE PASSWORD IS GENERATED HERE AND RETURNED EXACTLY ONCE
 *
 * The caller never chooses it. It is shown to the admin so they can pass it on,
 * and it is never retrievable again — only its hash is stored. The account is
 * marked `mustChangePassword`, so the admin's copy stops working the moment the
 * staff member sets their own. That matters most for doctors, whose accounts
 * can read patient names and reports.
 *
 * WHAT THIS WILL NOT DO
 *
 * It refuses to create a `super_admin`. An admin session that can mint
 * permanent admin accounts turns one stolen session into persistent access
 * that survives revoking the account it came from. Making another super admin
 * stays a server-shell operation.
 */

/** Roles this service will create. `super_admin` is deliberately absent. */
export const PROVISIONABLE_ROLES = ['doctor', 'lab_admin', 'rider'];

/**
 * A password that satisfies passwordSchema (8+, a letter, a number) and is
 * chosen by the machine.
 *
 * `randomInt` rather than `Math.random`: this is a credential, and
 * `Math.random` is seeded predictably enough that two accounts created in the
 * same tick can share a password.
 *
 * The alphabet omits characters that are misread when a password is passed on
 * by phone or written down — O/0, l/1/I — because it will be, and a login
 * failure that is really a transcription error is a miserable thing to debug.
 */
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

export function generateStaffPassword(length = 14) {
  const alphabet = LETTERS + DIGITS;
  const chars = [
    LETTERS[crypto.randomInt(LETTERS.length)],
    DIGITS[crypto.randomInt(DIGITS.length)],
  ];
  while (chars.length < length) {
    chars.push(alphabet[crypto.randomInt(alphabet.length)]);
  }

  // Fisher-Yates, so the guaranteed letter and digit are not always first.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function assertHandleAndPhoneFree(accountHandle, phone) {
  const clash = await User.findOne({ $or: [{ accountHandle }, { phone }] })
    .select('accountHandle phone')
    .lean();

  if (!clash) return;

  // Named precisely: "already taken" without saying which field sends the
  // admin back to guess.
  if (clash.accountHandle === accountHandle) {
    throw new AppError(`The handle "${accountHandle}" is already taken`, 409, 'HANDLE_TAKEN');
  }
  throw new AppError(`That phone number already has an account`, 409, 'PHONE_TAKEN');
}

/**
 * Creates the User row every staff member needs.
 * @returns {{ user: object, password: string }} the password, once.
 */
async function createStaffUser({ role, accountHandle, name, phone, createdBy = null }) {
  if (!PROVISIONABLE_ROLES.includes(role)) {
    throw new AppError(
      `Cannot provision role "${role}" here`,
      400,
      'ROLE_NOT_PROVISIONABLE'
    );
  }

  const handle = String(accountHandle).toLowerCase().trim();
  const cleanPhone = String(phone).trim();

  await assertHandleAndPhoneFree(handle, cleanPhone);

  const password = generateStaffPassword();

  const user = await User.create({
    accountHandle: handle,
    name: String(name).trim(),
    phone: cleanPhone,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    // The phone belongs to a real member of staff the admin has spoken to;
    // making them run an OTP before they can work adds nothing.
    isVerified: true,
    // Their own password, not the one the admin can see.
    mustChangePassword: true,
    createdBy,
  });

  return { user, password };
}

/** Creates a lab centre. No account — a centre is a place, not a login. */
export async function createLabCentre({
  name,
  area,
  address,
  lat,
  lng,
  priceMultiplier = 1.0,
  turnaroundHrs = 24,
  accreditation = {},
  isVerified = false,
}) {
  const existing = await LabCenter.findOne({ name: new RegExp(`^${name}$`, 'i') }).lean();
  if (existing) {
    throw new AppError(`A lab centre named "${name}" already exists`, 409, 'LAB_EXISTS');
  }

  // The schema bounds this 0.1–3.0, but the error it throws reads like a
  // validation dump. This multiplies every bill at the centre, so a mistyped
  // 15 for 1.5 is a ten-fold overcharge — worth its own sentence.
  const multiplier = Number(priceMultiplier);
  if (!Number.isFinite(multiplier) || multiplier < 0.5 || multiplier > 2.0) {
    throw new AppError(
      'Price multiplier must be between 0.5 and 2.0. It multiplies every test price at this centre.',
      422,
      'PRICE_MULTIPLIER_OUT_OF_RANGE'
    );
  }

  const lab = await LabCenter.create({
    name: String(name).trim(),
    area: String(area).trim(),
    address: String(address).trim(),
    geo: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
    priceMultiplier: multiplier,
    turnaroundHrs: Number(turnaroundHrs),
    accreditation: {
      nabl: Boolean(accreditation.nabl),
      iso: Boolean(accreditation.iso),
    },
    // A centre cannot receive bookings until someone verifies it, and creating
    // it is not verifying it.
    isVerified: Boolean(isVerified),
  });

  logger.info('Lab centre created', { labCenterId: lab._id.toString(), name: lab.name });
  return lab;
}

/** Creates a doctor: a login plus the profile the directory reads. */
export async function createDoctorAccount({
  accountHandle,
  name,
  phone,
  specialization,
  clinicName,
  consultationFee,
  walkInFee,
  qualification = null,
  experienceYears = null,
  createdBy = null,
}) {
  const { user, password } = await createStaffUser({
    role: 'doctor',
    accountHandle,
    name,
    phone,
    createdBy,
  });

  // Built then saved rather than created inline: `clinicAddress` defaults
  // through a function reading `this.clinicName`, which only resolves on a
  // real document.
  const doctor = await Doctor.create({
    userId: user._id,
    name: String(name).trim(),
    specialization: String(specialization).trim(),
    clinicName: String(clinicName).trim(),
    consultationFee: Number(consultationFee),
    walkInFee: Number(walkInFee),
    phone: String(phone).trim(),
    ...(qualification ? { qualification: String(qualification).trim() } : {}),
    ...(experienceYears !== null ? { experienceYears: Number(experienceYears) } : {}),
    // Created, not endorsed. The patient-facing directory lists active doctors
    // only, so a new doctor is invisible until an admin verifies them.
    isActive: false,
    isVerified: false,
  });

  logger.info('Doctor account created', {
    userId: user._id.toString(),
    doctorId: doctor._id.toString(),
    createdBy: createdBy ? String(createdBy) : null,
  });

  return { user, doctor, password };
}

/** Creates a phlebotomist: a login plus the Rider row dispatch reads. */
export async function createRiderAccount({
  accountHandle,
  name,
  phone,
  labCenterId,
  kitId = null,
  createdBy = null,
}) {
  const lab = await LabCenter.findById(labCenterId);
  if (!lab) {
    throw new AppError('That lab centre does not exist', 404, 'LAB_NOT_FOUND');
  }

  const { user, password } = await createStaffUser({
    role: 'rider',
    accountHandle,
    name,
    phone,
    createdBy,
  });

  const rider = await Rider.create({
    userId: user._id,
    labCenterId: lab._id,
    // Offline until they say otherwise. A rider who is "available" the instant
    // their account exists can be dispatched to a collection before anyone has
    // handed them a kit.
    status: 'offline',
    ...(kitId ? { kitId: String(kitId).trim() } : {}),
  });

  logger.info('Rider account created', {
    userId: user._id.toString(),
    riderId: rider._id.toString(),
    labCenterId: lab._id.toString(),
    createdBy: createdBy ? String(createdBy) : null,
  });

  return { user, rider, lab, password };
}

/** Creates a lab desk login, bound to one centre. */
export async function createLabAdminAccount({
  accountHandle,
  name,
  phone,
  labCenterId,
  createdBy = null,
}) {
  const lab = await LabCenter.findById(labCenterId);
  if (!lab) {
    throw new AppError('That lab centre does not exist', 404, 'LAB_NOT_FOUND');
  }

  const { user, password } = await createStaffUser({
    role: 'lab_admin',
    accountHandle,
    name,
    phone,
    createdBy,
  });

  // createStaffUser does not know about centres, so the link is set here.
  user.labCenterId = lab._id;
  await user.save();

  logger.info('Lab admin account created', {
    userId: user._id.toString(),
    labCenterId: lab._id.toString(),
    createdBy: createdBy ? String(createdBy) : null,
  });

  return { user, lab, password };
}

export default {
  PROVISIONABLE_ROLES,
  generateStaffPassword,
  createLabCentre,
  createDoctorAccount,
  createRiderAccount,
  createLabAdminAccount,
};

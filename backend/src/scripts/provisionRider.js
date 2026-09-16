/**
 * Provision a phlebotomist account.
 *
 * There is no API for this. `authService` hardcodes `role: 'patient'` on every
 * signup, and `riderRepository.createRider` is never called from any route — so
 * without this script a phlebotomist account cannot be created at all and the
 * rider app has nothing to sign in to.
 *
 * This is an operator tool, not seed data. It creates ONE account from
 * credentials you supply on the command line; it invents nothing (CONTEXT §11)
 * and it refuses to run against production, exactly as seedCatalogue does.
 *
 *   node src/scripts/provisionRider.js \
 *     --handle rider_arjun --phone 9876543210 --name "Arjun Mehta" \
 *     --password 'SomethingStrong1!' --lab "Sunrise Diagnostics"
 *
 * Re-running with the same handle updates that rider rather than erroring, so
 * it is safe to re-run after a password change.
 */
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { connectDB, disconnectDB } from '../config/dbConfig.js';
import { User } from '../schemas/User.js';
import { Rider } from '../schemas/Rider.js';
import { LabCenter } from '../schemas/LabCenter.js';
import { passwordSchema, phoneSchema, accountHandleSchema } from '@pathcare/validators';
import logger from '../utils/logger.js';

dotenv.config();

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

export async function provisionRider({
  handle,
  phone,
  name,
  password,
  labName,
  lat,
  lng,
  kitId = null,
  allowProduction = false,
}) {
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error(
      'Refusing to provision a rider against a production database. ' +
        'Staff accounts in production are created through the admin panel with verified identity.'
    );
  }

  // Validated with the same schemas the API uses, so a script-made account
  // cannot be weaker than one made through a route (CONTEXT §4.3).
  accountHandleSchema.parse(handle);
  phoneSchema.parse(phone);
  passwordSchema.parse(password);

  if (!name || !name.trim()) {
    throw new Error('--name is required. A phlebotomist introduces themselves at a patient\'s door.');
  }

  const labCenter = labName
    ? await LabCenter.findOne({ name: new RegExp(`^${labName.trim()}$`, 'i') })
    : await LabCenter.findOne({ isVerified: true }).sort({ createdAt: 1 });

  if (!labCenter) {
    throw new Error(
      labName
        ? `No lab centre named "${labName}". Run seedCatalogue.js first, or check the name.`
        : 'No verified lab centre exists. Run: node src/scripts/seedCatalogue.js'
    );
  }

  // A rider is dispatched from their centre, so that is where they start.
  const startLng = lng !== undefined ? Number(lng) : labCenter.geo?.coordinates?.[0];
  const startLat = lat !== undefined ? Number(lat) : labCenter.geo?.coordinates?.[1];

  if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
    throw new Error(
      `Lab centre "${labCenter.name}" has no coordinates and none were supplied. Pass --lat and --lng.`
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.findOneAndUpdate(
    { accountHandle: handle },
    {
      $set: {
        accountHandle: handle,
        phone,
        name: name.trim(),
        passwordHash,
        role: 'rider',
        isVerified: true,
        location: { lat: startLat, lng: startLng, address: labCenter.area || labCenter.name, source: 'manual' },
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const rider = await Rider.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        labCenterId: labCenter._id,
        currentLocation: { type: 'Point', coordinates: [startLng, startLat] },
        ...(kitId ? { kitId } : {}),
      },
      // Only on insert: re-running must not yank an on-duty rider off a job.
      $setOnInsert: { status: 'available', currentBookingId: null },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  return { user, rider, labCenter };
}

if (process.argv[1] && process.argv[1].endsWith('provisionRider.js')) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));

    const missing = ['handle', 'phone', 'name', 'password'].filter((key) => !args[key]);
    if (missing.length > 0) {
      process.stderr.write(
        `Missing required argument(s): ${missing.map((m) => `--${m}`).join(', ')}\n\n` +
          `Usage:\n  node src/scripts/provisionRider.js \\\n` +
          `    --handle rider_name --phone 9876543210 --name "Full Name" \\\n` +
          `    --password 'StrongPassword1!' [--lab "Lab Centre Name"] [--lat <latitude> --lng <longitude>]\n\n` +
          `Nothing is invented: every value comes from you.\n`
      );
      process.exit(1);
    }

    try {
      await connectDB();
      const { user, rider, labCenter } = await provisionRider({
        handle: args.handle,
        phone: args.phone,
        name: args.name,
        password: args.password,
        labName: args.lab,
        lat: args.lat,
        lng: args.lng,
        kitId: args.kit,
      });

      // The password is never echoed, and the logger redacts phone.
      logger.info('Rider provisioned', {
        accountHandle: user.accountHandle,
        riderId: rider._id.toString(),
        labCentre: labCenter.name,
        status: rider.status,
      });
      process.stdout.write(
        `\nRider ready.\n` +
          `  Sign in with handle : ${user.accountHandle}\n` +
          `  Lab centre          : ${labCenter.name}\n` +
          `  Status              : ${rider.status}\n\n`
      );
      await disconnectDB();
      process.exit(0);
    } catch (err) {
      logger.error('Rider provisioning failed', { error: err.message });
      process.stderr.write(`\n${err.message}\n\n`);
      process.exit(1);
    }
  })();
}

export default provisionRider;

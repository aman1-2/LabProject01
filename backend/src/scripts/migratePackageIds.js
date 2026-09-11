/**
 * Booking.packageId -> Booking.packageIds
 *
 * The field became a list so a basket can hold more than one checkup. Existing
 * documents carry the singular field; this moves each into a one-element array
 * and unsets the old one.
 *
 * Safe to run more than once: it only touches documents that still have
 * `packageId`, so a second run is a no-op rather than a double-migration.
 *
 * Dry by default. Nothing is written unless --apply is passed, because a
 * migration that runs the moment you type the command is a migration you
 * cannot inspect first.
 *
 *   node src/scripts/migratePackageIds.js               # report only
 *   node src/scripts/migratePackageIds.js --apply       # write
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set. Refusing to guess a database.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);
  const bookings = mongoose.connection.db.collection('bookings');

  // `$ne: null` alone would match documents where the field is absent in some
  // driver versions; $exists pins it to documents that actually carry it.
  const filter = { packageId: { $exists: true, $ne: null } };
  const pending = await bookings.countDocuments(filter);
  const orphaned = await bookings.countDocuments({ packageId: { $exists: true, $eq: null } });

  console.log(`database   : ${mongoose.connection.name}`);
  console.log(`to migrate : ${pending} booking(s) with a packageId`);
  console.log(`null-only  : ${orphaned} booking(s) with packageId: null (field simply removed)`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write these changes.');
    await mongoose.disconnect();
    return;
  }

  if (pending > 0) {
    // Two statements rather than one pipeline: this has to work on servers
    // older than 4.2, where update-with-aggregation is unavailable.
    const cursor = bookings.find(filter, { projection: { packageId: 1 } });
    let moved = 0;
    for await (const doc of cursor) {
      await bookings.updateOne(
        { _id: doc._id },
        { $set: { packageIds: [doc.packageId] }, $unset: { packageId: '' } }
      );
      moved += 1;
    }
    console.log(`moved      : ${moved}`);
  }

  const cleared = await bookings.updateMany(
    { packageId: { $exists: true } },
    { $unset: { packageId: '' } }
  );
  console.log(`cleaned    : ${cleared.modifiedCount} leftover packageId field(s) removed`);

  const remaining = await bookings.countDocuments({ packageId: { $exists: true } });
  console.log(`remaining  : ${remaining} (expected 0)`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../config/dbConfig.js';
import logger from '../utils/logger.js';

// Imported for its side effect: registers every model on the mongoose instance.
import '../schemas/index.js';

dotenv.config();

/**
 * Creates every index declared on a registered schema, and drops any index on the
 * collection that the schema no longer declares.
 *
 * Required because dbConfig sets `autoIndex: false` in production (CONTEXT §5.3),
 * so declaring `unique: true` on a schema does NOT create the index there. Without
 * this step the uniqueness of accountHandle and phone is enforced only by the
 * application-level check in authService, which two concurrent signups can race.
 *
 * Run as a deploy step, before the new revision starts serving traffic.
 */
export async function syncAllIndexes() {
  const modelNames = Object.keys(mongoose.models).sort();

  if (modelNames.length === 0) {
    throw new Error('No mongoose models are registered — nothing to sync.');
  }

  const results = [];

  for (const name of modelNames) {
    const model = mongoose.models[name];
    const dropped = await model.syncIndexes();
    const indexes = await model.collection.indexes();

    results.push({
      model: name,
      collection: model.collection.collectionName,
      indexes: indexes.map((i) => i.name),
      dropped,
    });

    logger.info(`Indexes synced for ${name}`, {
      collection: model.collection.collectionName,
      indexes: indexes.map((i) => i.name),
      // Surfaced explicitly: syncIndexes drops indexes the schema no longer declares.
      ...(dropped.length > 0 ? { droppedIndexes: dropped } : {}),
    });
  }

  return results;
}

// Standalone runner
if (process.argv[1] && process.argv[1].endsWith('syncIndexes.js')) {
  (async () => {
    try {
      await connectDB();
      await syncAllIndexes();
      logger.info('Index synchronisation complete');
      await disconnectDB();
      process.exit(0);
    } catch (err) {
      logger.error('Index synchronisation failed', { error: err.message });
      process.exit(1);
    }
  })();
}

export default syncAllIndexes;

import dotenv from 'dotenv';
import { connectDB } from '../config/dbConfig.js';
import { TestCatalog } from '../schemas/TestCatalog.js';
import { LabCenter } from '../schemas/LabCenter.js';
import logger from '../utils/logger.js';

dotenv.config();

import { REAL_TESTS, REAL_LABS } from '../../../common/catalogData.js';
export { REAL_TESTS, REAL_LABS };

export async function seedCatalogue({ allowProduction = false } = {}) {
  // Structural guard: seed data is for development. Nothing here should ever
  // reach a production database by accident.
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error(
      'Refusing to seed a production database. Catalogue and lab data must be ' +
        'entered through the admin panel from verified sources.'
    );
  }

  logger.info('Starting catalogue database seeding...');

  for (const testData of REAL_TESTS) {
    await TestCatalog.findOneAndUpdate(
      { slug: testData.slug },
      { $set: testData },
      { upsert: true, new: true, runValidators: true }
    );
  }
  logger.info(`Seeded ${REAL_TESTS.length} tests and packages successfully`);

  for (const labData of REAL_LABS) {
    await LabCenter.findOneAndUpdate(
      { name: labData.name, area: labData.area },
      { $set: labData },
      { upsert: true, new: true, runValidators: true }
    );
  }
  logger.info(`Seeded ${REAL_LABS.length} Dehradun lab centres successfully`);

  // Partner doctors are deliberately NOT seeded.
  //
  // This block previously created three named doctors with invented clinics,
  // invented phone numbers and invented MEDICAL REGISTRATION NUMBERS
  // (UK-MED-4491, UK-MED-5812, UK-MED-3920). They upserted into the live
  // doctors collection and surfaced in the public directory, where a patient
  // could be referred to a practitioner who does not exist. A registration
  // number is a regulatory assertion, not a placeholder (CONTEXT §3.1, §11).
  //
  // Real partner doctors are onboarded through the admin panel with verified
  // credentials.
}

// Standalone runner
if (process.argv[1] && process.argv[1].endsWith('seedCatalogue.js')) {
  (async () => {
    try {
      await connectDB();
      await seedCatalogue();
      logger.info('Catalogue seeding complete');
      process.exit(0);
    } catch (err) {
      logger.error('Catalogue seeding failed', { error: err.message });
      process.exit(1);
    }
  })();
}

export default seedCatalogue;

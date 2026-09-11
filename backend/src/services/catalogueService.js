import testRepository from '../repositories/testRepository.js';
import labRepository from '../repositories/labRepository.js';
import { getOrSetCache, purgeCatalogueCache } from '../utils/cacheUtils.js';
import { AppError } from '../utils/AppError.js';

// Haversine formula to calculate distance between two coordinates in kilometers
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function getTests({ category = 'all', search = '', page = 1, limit = 50 }) {
  const cacheKey = `tests:list:${category}:${search}:${page}:${limit}`;

  return getOrSetCache(cacheKey, 300, async () => {
    const skip = (page - 1) * limit;
    const { items, total } = await testRepository.findTests({
      category,
      search,
      skip,
      limit,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  });
}

export async function getTestBySlug(slug) {
  const normalizedSlug = slug.trim().toLowerCase();
  const cacheKey = `tests:slug:${normalizedSlug}`;

  return getOrSetCache(cacheKey, 300, async () => {
    const test = await testRepository.findTestBySlug(normalizedSlug);
    if (!test) {
      throw new AppError('Test not found in catalogue', 404, 'TEST_NOT_FOUND');
    }
    return test;
  });
}

export async function getNearbyLabsForTest({ lat, lng, testId, maxDistanceKm = 50 }) {
  // Resolve test
  let test;
  if (testId.match(/^[0-9a-fA-F]{24}$/)) {
    test = await testRepository.findTestById(testId);
  }
  if (!test) {
    test = await testRepository.findTestBySlug(testId);
  }

  if (!test) {
    throw new AppError('Test not found for lab pricing comparison', 404, 'TEST_NOT_FOUND');
  }

  const roundedLat = parseFloat(lat).toFixed(3);
  const roundedLng = parseFloat(lng).toFixed(3);
  const cacheKey = `labs:nearby:${roundedLat}:${roundedLng}:${test.slug}:${maxDistanceKm}`;

  return getOrSetCache(cacheKey, 300, async () => {
    const labs = await labRepository.findAllVerifiedLabs();

    const labsWithPricingAndDistance = labs
      .map((lab) => {
        let distanceKm = 0;
        if (lab.geo && lab.geo.coordinates && lab.geo.coordinates.length === 2) {
          const [labLng, labLat] = lab.geo.coordinates;
          distanceKm = calculateHaversineDistanceKm(lat, lng, labLat, labLng);
        }

        // CRITICAL per prompt: priceMultiplier — same test genuinely costs different amounts at different labs
        const price = Math.round(test.basePrice * (lab.priceMultiplier || 1.0));

        return {
          id: lab._id?.toString() || lab.id,
          name: lab.name,
          area: lab.area,
          address: lab.address,
          distanceKm: parseFloat(distanceKm.toFixed(1)),
          priceMultiplier: lab.priceMultiplier,
          price,
          turnaroundHrs: lab.turnaroundHrs || test.turnaroundHrs,
          accreditation: lab.accreditation || { nabl: false, iso: false },
          isOwned: lab.isOwned || false,
          geo: lab.geo,
        };
      })
      .filter((lab) => lab.distanceKm <= maxDistanceKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      test: {
        id: test._id?.toString() || test.id,
        name: test.name,
        slug: test.slug,
        category: test.category,
        sampleType: test.sampleType,
        homeCollectionAvailable: test.homeCollectionAvailable,
        basePrice: test.basePrice,
        turnaroundHrs: test.turnaroundHrs,
      },
      labs: labsWithPricingAndDistance,
    };
  });
}

export { purgeCatalogueCache };

export default {
  getTests,
  getTestBySlug,
  getNearbyLabsForTest,
  purgeCatalogueCache,
};

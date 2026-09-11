import { TestCatalog } from '../schemas/TestCatalog.js';

export async function findTests({ category, search, skip = 0, limit = 50 }) {
  const query = {};

  if (category && category !== 'all') {
    query.category = category;
  }

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
      { tags: { $in: [new RegExp(escaped, 'i')] } },
    ];
  }

  const [items, total] = await Promise.all([
    TestCatalog.find(query)
      .sort({ category: 1, basePrice: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TestCatalog.countDocuments(query),
  ]);

  return { items, total };
}

export async function findTestBySlug(slug) {
  return TestCatalog.findOne({ slug: slug.toLowerCase() }).lean();
}

export async function findTestById(id) {
  return TestCatalog.findById(id).lean();
}

export async function upsertTest(testData) {
  return TestCatalog.findOneAndUpdate(
    { slug: testData.slug.toLowerCase() },
    { $set: testData },
    { upsert: true, new: true, runValidators: true }
  );
}

export default {
  findTests,
  findTestBySlug,
  findTestById,
  upsertTest,
};

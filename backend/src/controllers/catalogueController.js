import catalogueService from '../services/catalogueService.js';

export async function getTests(req, res, next) {
  try {
    const { category, search, page, limit } = req.query;
    const result = await catalogueService.getTests({
      category,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTestBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const test = await catalogueService.getTestBySlug(slug);

    res.status(200).json({
      success: true,
      data: test,
    });
  } catch (error) {
    next(error);
  }
}

export async function getNearbyLabs(req, res, next) {
  try {
    const { lat, lng, testId, maxDistanceKm } = req.query;
    const result = await catalogueService.getNearbyLabsForTest({
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      testId,
      maxDistanceKm: maxDistanceKm ? parseFloat(maxDistanceKm) : 50,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getTests,
  getTestBySlug,
  getNearbyLabs,
};

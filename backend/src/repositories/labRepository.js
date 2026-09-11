import { LabCenter } from '../schemas/LabCenter.js';

export async function findAllVerifiedLabs() {
  return LabCenter.find({ isVerified: true }).lean();
}

export async function findLabById(id) {
  return LabCenter.findById(id).lean();
}

export async function findNearbyLabs({ lng, lat, maxDistanceMeters = 50000 }) {
  // Use geoNear or 2dsphere $near query
  return LabCenter.find({
    isVerified: true,
    geo: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        $maxDistance: maxDistanceMeters,
      },
    },
  }).lean();
}

export async function upsertLab(labData) {
  return LabCenter.findOneAndUpdate(
    { name: labData.name, area: labData.area },
    { $set: labData },
    { upsert: true, new: true, runValidators: true }
  );
}

export default {
  findAllVerifiedLabs,
  findLabById,
  findNearbyLabs,
  upsertLab,
};

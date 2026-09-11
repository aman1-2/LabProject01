import { PartnerApplication } from '../schemas/PartnerApplication.js';

export async function create(applicationData) {
  return PartnerApplication.create(applicationData);
}

export async function findAll(filter = {}) {
  return PartnerApplication.find(filter).sort({ createdAt: -1 }).lean();
}

export default {
  create,
  findAll,
};

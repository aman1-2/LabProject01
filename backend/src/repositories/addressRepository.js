import { Address } from '../schemas/Address.js';

export async function create(addressData, session = null) {
  const options = session ? { session } : {};
  const [address] = await Address.create([addressData], options);
  return address;
}

export async function findByOwnerId(ownerId) {
  return Address.find({ ownerId }).sort({ isDefault: -1, createdAt: -1 });
}

export async function findByIdAndOwner(id, ownerId, session = null) {
  const query = Address.findOne({ _id: id, ownerId });
  if (session) query.session(session);
  return query;
}

export async function updateByIdAndOwner(id, ownerId, updateData, session = null) {
  const query = Address.findOneAndUpdate(
    { _id: id, ownerId },
    updateData,
    { new: true, runValidators: true }
  );
  if (session) query.session(session);
  return query;
}

export async function deleteByIdAndOwner(id, ownerId, session = null) {
  const query = Address.findOneAndDelete({ _id: id, ownerId });
  if (session) query.session(session);
  return query;
}

export async function countByOwnerId(ownerId, session = null) {
  const query = Address.countDocuments({ ownerId });
  if (session) query.session(session);
  return query;
}

export async function unsetOtherDefaults(ownerId, excludeAddressId = null, session = null) {
  const filter = { ownerId, isDefault: true };
  if (excludeAddressId) {
    filter._id = { $ne: excludeAddressId };
  }
  const query = Address.updateMany(filter, { $set: { isDefault: false } });
  if (session) query.session(session);
  return query;
}

export async function findLatestByOwnerId(ownerId, session = null) {
  const query = Address.findOne({ ownerId }).sort({ createdAt: -1 });
  if (session) query.session(session);
  return query;
}

export default {
  create,
  findByOwnerId,
  findByIdAndOwner,
  updateByIdAndOwner,
  deleteByIdAndOwner,
  countByOwnerId,
  unsetOtherDefaults,
  findLatestByOwnerId,
};

import { FamilyMember } from '../schemas/FamilyMember.js';

export async function create(memberData) {
  return FamilyMember.create(memberData);
}

export async function findByOwnerId(ownerId) {
  return FamilyMember.find({ ownerId }).sort({ createdAt: -1 });
}

export async function findByIdAndOwner(id, ownerId) {
  return FamilyMember.findOne({ _id: id, ownerId });
}

export async function updateByIdAndOwner(id, ownerId, updateData) {
  return FamilyMember.findOneAndUpdate(
    { _id: id, ownerId },
    updateData,
    { new: true, runValidators: true }
  );
}

export async function deleteByIdAndOwner(id, ownerId) {
  return FamilyMember.findOneAndDelete({ _id: id, ownerId });
}

export async function countByOwnerId(ownerId) {
  return FamilyMember.countDocuments({ ownerId });
}

export default {
  create,
  findByOwnerId,
  findByIdAndOwner,
  updateByIdAndOwner,
  deleteByIdAndOwner,
  countByOwnerId,
};

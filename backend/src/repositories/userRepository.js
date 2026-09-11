import User from '../schemas/User.js';

export async function findByHandle(accountHandle) {
  if (!accountHandle) return null;
  return User.findOne({ accountHandle: accountHandle.toLowerCase().trim() });
}

export async function findByPhone(phone) {
  if (!phone) return null;
  return User.findOne({ phone: phone.trim() });
}

export async function findById(id) {
  return User.findById(id);
}

export async function create(userData) {
  return User.create(userData);
}

export async function update(id, updateData) {
  return User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
}

export default {
  findByHandle,
  findByPhone,
  findById,
  create,
  update,
};

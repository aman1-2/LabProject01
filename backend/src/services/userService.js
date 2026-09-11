import { User } from '../schemas/User.js';
import { AppError } from '../utils/AppError.js';

export async function getUserProfile(userId) {
  const user = await User.findById(userId).select('-passwordHash');
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
}

export async function updateUserProfile(userId, updateData) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (updateData.phone && updateData.phone !== user.phone) {
    const existing = await User.findOne({ phone: updateData.phone, _id: { $ne: userId } });
    if (existing) {
      throw new AppError('Phone number already in use by another account', 409, 'PHONE_ALREADY_IN_USE');
    }
    user.phone = updateData.phone;
  }

  if (updateData.name) {
    user.name = updateData.name;
  }

  if (updateData.location) {
    user.location = {
      ...(user.location?.toObject ? user.location.toObject() : user.location),
      ...updateData.location,
      source: updateData.location.source || user.location?.source || 'manual',
    };
  }

  await user.save();

  return User.findById(userId).select('-passwordHash');
}

export default {
  getUserProfile,
  updateUserProfile,
};

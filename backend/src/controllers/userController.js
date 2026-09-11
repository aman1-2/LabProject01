import { registerPushToken } from '../services/pushNotificationService.js';
import { getUserProfile, updateUserProfile } from '../services/userService.js';
import { updateUserProfileSchema } from '@pathcare/validators';

export async function getProfile(req, res, next) {
  try {
    const userId = req.user.userId || req.user.id;
    const user = await getUserProfile(userId);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const userId = req.user.userId || req.user.id;
    const validatedData = updateUserProfileSchema.parse(req.body);
    const updatedUser = await updateUserProfile(userId, validatedData);
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getProfile,
  updateProfile,
};

/**
 * PUT /api/users/me/push-token
 * Registers the CALLING user's device for push. Scoped to req.user, so a caller
 * can never register a token against somebody else's account.
 */
export async function setPushToken(req, res, next) {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await registerPushToken({
      userId,
      expoPushToken: req.body?.expoPushToken ?? null,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

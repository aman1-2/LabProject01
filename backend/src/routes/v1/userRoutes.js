import express from 'express';
import { getProfile, updateProfile, setPushToken } from '../../controllers/userController.js';
import { isAuthenticated } from '../../middlewares/authMiddleware.js';

const router = express.Router();

router.use(isAuthenticated);

router.get('/me', getProfile);
router.patch('/me', updateProfile);

// Device registration for push. Always the caller's own account.
router.put('/me/push-token', setPushToken);

export default router;

import express from 'express';
import {
  createSubscription,
  listSubscriptions,
  getSubscription,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
} from '../../controllers/subscriptionController.js';
import { isAuthenticated } from '../../middlewares/authMiddleware.js';
import { validateBody } from '../../middlewares/validateRequest.js';
import { createSubscriptionSchema, cancelSubscriptionSchema } from '@pathcare/validators';

const router = express.Router();

// Every subscription is owned by a patient; ownership is enforced in the
// service, which returns 404 (not 403) for anything it does not own (§3.2).
router.use(isAuthenticated);

router.post('/', validateBody(createSubscriptionSchema), createSubscription);
router.get('/', listSubscriptions);
router.get('/:id', getSubscription);
router.post('/:id/pause', pauseSubscription);
router.post('/:id/resume', resumeSubscription);
router.post('/:id/cancel', validateBody(cancelSubscriptionSchema), cancelSubscription);

export default router;

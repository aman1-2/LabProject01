import express from 'express';
import { getNearbyLabs } from '../../controllers/catalogueController.js';
import { validateQuery } from '../../middlewares/validateRequest.js';
import { nearbyLabsQuerySchema } from '@pathcare/validators';

const router = express.Router();

// GET /api/labs/nearby — find labs sorted by distance with computed prices (public, read-only)
router.get('/nearby', validateQuery(nearbyLabsQuerySchema), getNearbyLabs);

export default router;

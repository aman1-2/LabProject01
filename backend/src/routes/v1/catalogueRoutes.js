import express from 'express';
import { getTests, getTestBySlug } from '../../controllers/catalogueController.js';
import { validateQuery, validateParams } from '../../middlewares/validateRequest.js';
import { testQuerySchema, testSlugSchema } from '@pathcare/validators';

const router = express.Router();

// GET /api/tests — list / filter / search tests (public, read-only)
router.get('/', validateQuery(testQuerySchema), getTests);

// GET /api/tests/:slug — full clinical detail (public, read-only)
router.get('/:slug', validateParams(testSlugSchema), getTestBySlug);

export default router;

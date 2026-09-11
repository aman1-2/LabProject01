import express from 'express';
import { submitApplication } from '../../controllers/partnerController.js';

const router = express.Router();

// POST /api/partner/apply — submit doctor or lab partnership application
router.post('/apply', submitApplication);

export default router;

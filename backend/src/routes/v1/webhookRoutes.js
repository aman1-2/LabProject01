import express from 'express';
import { handleRazorpayWebhook } from '../../controllers/webhookController.js';

const router = express.Router();

// POST /api/webhooks/razorpay — strictly never rate-limited per PATHCARE_CONTEXT.md §3.3
router.post('/razorpay', handleRazorpayWebhook);

export default router;

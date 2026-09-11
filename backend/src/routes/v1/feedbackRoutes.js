import express from 'express';
import { submitFeedback } from '../../controllers/feedbackController.js';
import { isAuthenticated } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// POST /api/feedback — authenticated patient submits feedback
router.post('/', isAuthenticated, submitFeedback);

export default router;

import { createFeedback } from '../services/feedbackService.js';
import { createFeedbackSchema } from '@pathcare/validators';

export async function submitFeedback(req, res, next) {
  try {
    const validated = createFeedbackSchema.parse(req.body);
    const userId = req.user.id || req.user._id || req.user.userId;

    const feedback = await createFeedback({
      ...validated,
      userId,
    });

    return res.status(201).json({
      success: true,
      data: feedback,
      message: 'Feedback submitted successfully',
    });
  } catch (err) {
    next(err);
  }
}

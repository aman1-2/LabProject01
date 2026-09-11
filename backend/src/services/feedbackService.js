import Feedback from '../schemas/Feedback.js';
import Booking from '../schemas/Booking.js';
import AppError from '../utils/AppError.js';

/**
 * Submit patient feedback for a booking
 */
export async function createFeedback({ bookingId, userId, text = '', pickAndDropInterest = 0, rating = 5 }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.patientId.toString() !== userId.toString()) {
    throw new AppError('Not authorized to submit feedback for this booking', 403, 'FORBIDDEN');
  }

  // Normalize pickAndDropInterest: boolean to 1/0, or number
  const pickDropVal = pickAndDropInterest === true || pickAndDropInterest === 1 ? 1 : 0;

  const feedback = await Feedback.create({
    bookingId,
    userId,
    text: (text || '').trim(),
    pickAndDropInterest: pickDropVal,
    rating: Math.min(Math.max(Number(rating) || 5, 1), 5),
  });

  return feedback;
}

/**
 * List all patient feedbacks for Admin console
 */
export async function listAllFeedback(options = {}) {
  const { limit = 50, skip = 0 } = options;

  const feedbacks = await Feedback.find({})
    .populate('bookingId', 'amount mode status slotDateTime')
    .populate('userId', 'name phone accountHandle')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return feedbacks;
}

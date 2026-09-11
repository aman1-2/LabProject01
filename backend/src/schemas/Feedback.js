import mongoose from 'mongoose';

/**
 * Feedback Schema per PATHCARE_CONTEXT.md §5.1 & prototype line 988
 * Patient feedback collected after booking completion,
 * including interest in medicine pick-and-drop service.
 */
const feedbackSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking ID is required'],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    text: {
      type: String,
      default: '',
      trim: true,
      maxlength: [2000, 'Feedback text cannot exceed 2000 characters'],
    },
    pickAndDropInterest: {
      type: Number, // 1 = interested ("Wants pick-and-drop"), 0 = not interested
      default: 0,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
    },
  },
  {
    timestamps: true,
    collection: 'feedbacks',
  }
);

feedbackSchema.index({ createdAt: -1 });

export const Feedback = mongoose.model('Feedback', feedbackSchema);
export default Feedback;

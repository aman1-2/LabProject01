// backend/src/schemas/Report.js
import mongoose from 'mongoose';
import './Booking.js';
import './User.js';
import './Doctor.js';

const reportEditLogSchema = new mongoose.Schema(
  {
    summaryHtml: {
      type: String,
      required: true,
    },
    authoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    editedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    changeNotes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: true }
);

const reportSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
      index: true,
    },
    pdfUrl: {
      type: String,
      required: true,
      trim: true,
    },
    summaryHtml: {
      type: String,
      required: true,
    },
    authoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    recommendedDoctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    recommendationReason: {
      type: String,
      trim: true,
      default: null,
    },
    editHistory: {
      type: [reportEditLogSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'reports',
  }
);

// Indexes per PATHCARE_CONTEXT.md §5.3
// Note: bookingId has unique: true, index: true declared inline above

export const Report = mongoose.model('Report', reportSchema);
export default Report;

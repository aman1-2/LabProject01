// backend/src/schemas/Sample.js
import mongoose from 'mongoose';
import './Booking.js';
import './User.js';

const coldChainReadingSchema = new mongoose.Schema(
  {
    temperature: {
      type: Number,
      required: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: true }
);

const sampleSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    barcode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    collectedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    coldChainLog: {
      type: [coldChainReadingSchema],
      default: [],
    },
    handoffTimestamps: {
      collectedAt: {
        type: Date,
        default: null,
      },
      submittedAt: {
        type: Date,
        default: null,
      },
      labReceivedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
    collection: 'samples',
  }
);

export const Sample = mongoose.model('Sample', sampleSchema);
export default Sample;


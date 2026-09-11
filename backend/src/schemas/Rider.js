import mongoose from 'mongoose';
import './User.js';
import './LabCenter.js';

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      default: [0, 0], // [longitude, latitude]
    },
  },
  { _id: false }
);

const riderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    labCenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LabCenter',
      required: true,
      index: true,
    },
    currentLocation: {
      type: pointSchema,
      default: () => ({ type: 'Point', coordinates: [77.5946, 12.9716] }), // default Bangalore
    },
    status: {
      type: String,
      enum: ['available', 'assigned', 'offline'],
      default: 'available',
      index: true,
    },
    currentBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    kitId: {
      type: String,
      trim: true,
      default: null,
    },
    trainingCertifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// CONTEXT §5.3: riders: { currentLocation: '2dsphere' }, { labCenterId: 1, status: 1 }
riderSchema.index({ currentLocation: '2dsphere' });
riderSchema.index({ labCenterId: 1, status: 1 });

export const Rider = mongoose.model('Rider', riderSchema);
export default Rider;

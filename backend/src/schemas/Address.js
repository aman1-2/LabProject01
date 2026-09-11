import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner ID is required'],
      index: true,
    },
    label: {
      type: String,
      enum: ['Home', 'Work', 'Other'],
      default: 'Home',
    },
    line: {
      type: String,
      required: [true, 'Address line is required'],
      trim: true,
      maxlength: 300,
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      trim: true,
      match: [/^\d{6}$/, 'Please enter a valid 6-digit Indian pincode'],
    },
    lat: {
      type: Number,
      default: 30.3165,
    },
    lng: {
      type: Number,
      default: 78.0322,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

addressSchema.index({ ownerId: 1, isDefault: -1, createdAt: -1 });

export const Address = mongoose.model('Address', addressSchema);
export default Address;

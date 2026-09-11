import mongoose from 'mongoose';

const labCenterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Lab center name is required'],
      trim: true,
      index: true,
    },
    area: {
      type: String,
      required: [true, 'Area is required'],
      trim: true,
      index: true,
    },
    address: {
      type: String,
      required: [true, 'Full address is required'],
      trim: true,
    },
    geo: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat] per GeoJSON format
        required: [true, 'Geo coordinates [longitude, latitude] are required'],
      },
    },
    serviceAreaPincodes: {
      type: [String],
      default: [],
      index: true,
    },
    accreditation: {
      nabl: { type: Boolean, default: false },
      iso: { type: Boolean, default: false },
      icmr: { type: Boolean, default: false },
      expiry: { type: Date, default: null },
    },
    // CRITICAL per prompt: priceMultiplier — the same test genuinely costs different amounts at different labs
    priceMultiplier: {
      type: Number,
      required: true,
      default: 1.0,
      min: [0.1, 'Price multiplier must be positive'],
      max: [3.0, 'Price multiplier cannot exceed 3.0'],
    },
    turnaroundHrs: {
      type: Number,
      required: true,
      default: 6,
    },
    // A centre is NOT accredited until someone verifies its paperwork.
    // This defaulted to `true`, so any centre created by any path was
    // immediately bookable — the accreditation gate bookingService relies on
    // was open by default (CONTEXT §5.1).
    isVerified: {
      type: Boolean,
      default: false,
    },
    isOwned: {
      type: Boolean,
      default: false,
    },
    contactPhone: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// 2dsphere index for geospatial distance querying
labCenterSchema.index({ geo: '2dsphere' });

export const LabCenter = mongoose.models.LabCenter || mongoose.model('LabCenter', labCenterSchema);
export default LabCenter;

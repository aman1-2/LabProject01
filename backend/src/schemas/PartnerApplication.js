import mongoose from 'mongoose';

const partnerApplicationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['doctor', 'lab'],
      required: [true, 'Partner type is required (doctor or lab)'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    regNumber: {
      type: String,
      trim: true,
      default: '',
    },
    facilityName: {
      type: String,
      required: [true, 'Clinic or laboratory name is required'],
      trim: true,
    },
    specialityOrServices: {
      type: String,
      required: [true, 'Speciality or services offered is required'],
      trim: true,
    },
    area: {
      type: String,
      required: [true, 'Area in Dehradun is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['received', 'pending', 'contacted', 'approved', 'rejected'],
      default: 'received',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'partner_applications',
  }
);

partnerApplicationSchema.index({ type: 1, createdAt: -1 });

export const PartnerApplication = mongoose.model('PartnerApplication', partnerApplicationSchema);
export default PartnerApplication;

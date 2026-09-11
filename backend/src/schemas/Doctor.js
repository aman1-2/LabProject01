import mongoose from 'mongoose';

// Doctor schema per PATHCARE_CONTEXT.md §2.2 & §5.1
// NMC COMPLIANCE RULE: PathCare takes NO commission, pays NO referral fee, and holds NO doctor funds.
// This model MUST NOT have earnings, commission, balance, withdrawal or payment fields.
const doctorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
      sparse: true,
    },
    name: {
      type: String,
      required: [true, 'Doctor name is required'],
      trim: true,
      index: true,
    },
    qualification: {
      type: String,
      trim: true,
      default: 'MBBS',
    },
    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      trim: true,
      index: true,
    },
    clinicName: {
      type: String,
      required: [true, 'Clinic name is required'],
      trim: true,
    },
    clinicAddress: {
      type: String,
      trim: true,
      default: function () {
        return this.clinicName ? `${this.clinicName}, Dehradun` : 'Clinic Address, Dehradun';
      },
    },
    consultationFee: {
      type: Number,
      required: [true, 'Consultation fee is required'],
      min: [0, 'Fee cannot be negative'],
      default: 500,
    },
    walkInFee: {
      type: Number,
      required: [true, 'Walk-in fee is required'],
      min: [0, 'Walk-in fee cannot be negative'],
      default: 600,
    },
    experienceYears: {
      type: Number,
      default: 5,
      min: [0, 'Experience cannot be negative'],
    },
    tier: {
      type: String,
      enum: ['Starter', 'Growth', 'Gold'],
      default: 'Starter',
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: true,
      index: true,
    },
    referralCount: {
      type: Number,
      default: 0,
    },
    about: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
    },
    regNumber: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'doctors',
  }
);

// Virtual for Gold tier featured status per CONTEXT §2.4 & prototype line 722
doctorSchema.virtual('isFeatured').get(function () {
  return this.tier === 'Gold';
});

doctorSchema.set('toJSON', { virtuals: true });
doctorSchema.set('toObject', { virtuals: true });

// Compound index for clinical appropriateness and tier ranking (CONTEXT §2.4)
doctorSchema.index({ specialization: 1, tier: 1, isActive: 1 });

export const Doctor = mongoose.model('Doctor', doctorSchema);
export default Doctor;

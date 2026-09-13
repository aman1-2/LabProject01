import mongoose from 'mongoose';

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
    /**
     * Where the clinic actually is.
     *
     * This used to default to `${clinicName}, Dehradun`, which put a real city
     * on a record nobody had entered one for. Every doctor provisioned outside
     * Dehradun carried a confidently wrong address — a patient reading it is
     * sent to the wrong city. An address is a fact about the world; when it is
     * not supplied the honest value is nothing, and the UI already falls back
     * to the clinic name.
     */
    clinicAddress: {
      type: String,
      trim: true,
      default: null,
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

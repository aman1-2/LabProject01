import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    lat: {
      type: Number,
      required: [true, 'Latitude is required'],
    },
    lng: {
      type: Number,
      required: [true, 'Longitude is required'],
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    source: {
      type: String,
      enum: ['geo', 'manual'],
      required: true,
      default: 'manual',
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    accountHandle: {
      type: String,
      required: [true, 'Account handle is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    /**
     * Set when an account is created FOR someone by an admin, rather than by
     * the person themselves. Until they choose their own password, the admin
     * who typed it in knows a working credential for their account — and a
     * doctor's account can read patient names and reports, so "the admin can
     * sign in as a doctor" is not a theoretical problem.
     *
     * Enforced server-side by `requirePasswordChanged`, not merely surfaced to
     * the client: a flag the UI is trusted to honour is not a control.
     */
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    /**
     * Which admin provisioned this account, if any. Staff accounts are made by
     * people, and when one turns out to have been made in error the first
     * question is always who made it.
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      enum: ['patient', 'rider', 'lab_admin', 'doctor', 'super_admin'],
      default: 'patient',
      index: true,
    },
    // accountType is MUTABLE per CONTEXT §5.1
    accountType: {
      type: String,
      enum: ['single', 'family'],
      default: 'single',
    },
    /**
     * Where we collect from. That is a patient concept: it is the address a
     * phlebotomist is sent to.
     *
     * Staff accounts have no such address — a doctor's account is not somewhere
     * we draw blood — so requiring one for them would mean inventing
     * coordinates to satisfy the schema, which is the opposite of what the
     * field is for. Required for patients, where it is real and load-bearing.
     */
    location: {
      type: locationSchema,
      required: function requiredForPatients() {
        return this.role === 'patient';
      },
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
    // Expo push token for this user's device. A device identifier, so it is
    // redacted by the logger alongside other PII (CONTEXT §9.10).
    expoPushToken: {
      type: String,
      default: null,
      trim: true,
    },
    labCenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LabCenter',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes per CONTEXT §5.3
userSchema.index({ accountHandle: 1 }, { unique: true });
userSchema.index({ phone: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
export default User;

import mongoose from 'mongoose';

/**
 * ExternalReferralMention Schema
 * Stores doctors named by patients via free text during booking.
 * Automatically aggregated by normalizedName to provide ranked recruitment leads.
 */
const externalReferralMentionSchema = new mongoose.Schema(
  {
    rawName: {
      type: String,
      required: [true, 'Raw name is required'],
      trim: true,
    },
    normalizedName: {
      type: String,
      required: [true, 'Normalized name is required'],
      unique: true,
      trim: true,
      index: true,
    },
    mentionCount: {
      type: Number,
      default: 1,
      min: [1, 'Mention count cannot be less than 1'],
      index: true,
    },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'In discussion', 'Converted', 'Declined'],
      default: 'New',
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    lastMentionedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'external_referral_mentions',
  }
);

// Compound index for admin pipeline sorting: most mentioned first
externalReferralMentionSchema.index({ mentionCount: -1, lastMentionedAt: -1 });

export const ExternalReferralMention = mongoose.model(
  'ExternalReferralMention',
  externalReferralMentionSchema
);

export default ExternalReferralMention;

import mongoose from 'mongoose';

/**
 * DailyStats Schema per PATHCARE_CONTEXT.md §5.1 & prompt
 * Nightly rollup snapshot of key business and operational metrics.
 * Idempotently computed per date.
 */
const dailyStatsSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },
    bookingsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    revenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    revenuePending: {
      type: Number,
      default: 0,
      min: 0,
    },
    reportsDelivered: {
      type: Number,
      default: 0,
      min: 0,
    },
    newSignups: {
      type: Number,
      default: 0,
      min: 0,
    },
    modeSplit: {
      home: { type: Number, default: 0, min: 0 },
      visit: { type: Number, default: 0, min: 0 },
    },
    paymentSplit: {
      upi: { type: Number, default: 0, min: 0 },
      cash: { type: Number, default: 0, min: 0 },
    },
    perLabVolumes: [
      {
        labCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabCenter' },
        labName: { type: String, default: '' },
        count: { type: Number, default: 0, min: 0 },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'daily_stats',
  }
);

dailyStatsSchema.index({ date: -1 });

export const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);
export default DailyStats;

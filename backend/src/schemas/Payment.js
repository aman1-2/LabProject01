import mongoose from 'mongoose';
import './Booking.js';
import './User.js';

const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // `sparse` is an index option, so setting it here declares an index that
    // the block below declares again. Declared once, there, with the same
    // sparse+unique semantics.
    gatewayOrderId: {
      type: String,
    },
    gatewayPaymentId: {
      type: String,
      sparse: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
      default: 'created',
      index: true,
    },
    // 'pending' = refund requested at the gateway, outcome not yet confirmed.
    // 'failed'  = the gateway call errored; money has NOT been returned.
    // Neither may ever be reported to a patient as a completed refund.
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'failed', 'partial', 'full'],
      default: 'none',
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Razorpay refund id — the evidence that money actually left the gateway.
    gatewayRefundId: {
      type: String,
      default: null,
    },
    webhookEventIds: {
      type: [String],
      default: [],
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'payments',
  }
);

// Indexes per PATHCARE_CONTEXT.md §5.3
paymentSchema.index({ gatewayOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ webhookEventIds: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;

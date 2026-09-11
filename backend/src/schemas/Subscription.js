import mongoose from 'mongoose';
import './User.js';
import './TestCatalog.js';
import './LabCenter.js';

/**
 * A recurring test package billed through a Razorpay Subscription with a UPI
 * AutoPay mandate.
 *
 * The booking-address snapshot mirrors Booking.collectionAddress and exists for
 * the same reason: a cycle billed in March must be collected from the address
 * agreed in January, not from whatever the patient's address book happens to
 * hold when the charge lands.
 */
const subscriptionAddressSubSchema = new mongoose.Schema(
  {
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', default: null },
    label: { type: String, trim: true, default: null },
    line: { type: String, trim: true, required: true },
    pincode: { type: String, trim: true, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /**
     * Packages are TestCatalog rows with `category: 'package'` or `'plan'`.
     * (This previously said ref: 'TestPackage', a model nothing writes to, so
     * every populate returned null.)
     */
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestCatalog',
      required: true,
    },
    labCenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LabCenter',
      required: true,
    },
    frequencyDays: {
      type: Number,
      required: true,
      default: 90,
      min: [1, 'A subscription must have a positive interval'],
    },
    /**
     * The amount the MANDATE authorises, in rupees.
     *
     * Deliberately stored rather than recomputed per cycle. A UPI AutoPay
     * mandate authorises a specific amount; if the catalogue price later
     * changes, silently charging the new one would debit more than the patient
     * agreed to. A price change requires a new mandate, so this field is the
     * authority for what any cycle costs.
     */
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    mode: {
      type: String,
      enum: ['home', 'visit'],
      default: 'home',
    },
    collectionAddress: {
      type: subscriptionAddressSubSchema,
      default: null,
    },
    nextScheduledDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      // `pending_authorization` covers the window between creating the
      // subscription and the patient approving the mandate in their UPI app.
      // Treating that as `active` would schedule charges against a mandate
      // that may never be authorised.
      enum: ['pending_authorization', 'active', 'paused', 'cancelled', 'halted'],
      default: 'pending_authorization',
      index: true,
    },
    /**
     * Mirrors the gateway's own view of the mandate, which can change without
     * us asking — a patient can revoke a UPI mandate from their bank app and
     * we only learn via webhook.
     */
    mandateStatus: {
      type: String,
      enum: ['created', 'authenticated', 'active', 'paused', 'cancelled', 'halted', 'expired'],
      default: 'created',
    },
    razorpaySubscriptionId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    razorpayPlanId: {
      type: String,
      default: null,
    },
    /** Where the patient authorises the mandate. Short-lived, from the gateway. */
    authorizationUrl: {
      type: String,
      default: null,
    },
    lastChargeAt: {
      type: Date,
      default: null,
    },
    lastChargeStatus: {
      type: String,
      enum: ['succeeded', 'failed', null],
      default: null,
    },
    /**
     * The cycle a pre-debit notification has already been sent for.
     *
     * RBI requires notice at least 24h before each recurring debit. Storing the
     * cycle date rather than a boolean makes the send exactly-once PER CYCLE:
     * a boolean would either re-send every sweep or never send again.
     */
    preDebitNotifiedFor: {
      type: Date,
      default: null,
    },
    preDebitNotifiedAt: {
      type: Date,
      default: null,
    },
    /**
     * Webhook event ids already applied, exactly as Payment does it. Razorpay
     * legitimately redelivers, and a redelivered `subscription.charged` must
     * not produce a second booking (CONTEXT §3.3).
     */
    webhookEventIds: {
      type: [String],
      default: [],
      index: true,
    },
    /** Bookings this subscription has generated, newest last. */
    bookingIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
      },
    ],
    pausedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: null },
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.index({ patientId: 1, createdAt: -1 });
// The pre-debit sweep and the billing sweep both scan on these two together.
subscriptionSchema.index({ status: 1, nextScheduledDate: 1 });

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
export default Subscription;

import mongoose from 'mongoose';
import './Doctor.js';
import './User.js';

// Consultation schema per PATHCARE_CONTEXT.md §2.2 & §5.1
// NMC COMPLIANCE: Slot and parties only, NO payment fields whatsoever.
// Patients pay doctors directly at the clinic. PathCare processes no consultation payment.
const consultationSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor ID is required'],
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    slotDateTime: {
      type: Date,
      required: [true, 'Slot date and time is required'],
    },
    slotLabel: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['booked', 'completed', 'cancelled'],
      default: 'booked',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'consultations',
  }
);

consultationSchema.index({ doctorId: 1, slotDateTime: 1 });
consultationSchema.index({ patientId: 1, createdAt: -1 });

export const Consultation = mongoose.model('Consultation', consultationSchema);
export default Consultation;

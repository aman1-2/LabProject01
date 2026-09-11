import mongoose from 'mongoose';
import doctorRepository from '../repositories/doctorRepository.js';
import consultationRepository from '../repositories/consultationRepository.js';
import partnerApplicationRepository from '../repositories/partnerApplicationRepository.js';
import { Booking } from '../schemas/Booking.js';
import { AppError } from '../utils/AppError.js';

// Tier priority ranking per CONTEXT §2.4 & prototype line 716
const TIER_ORDER = {
  Gold: 0,
  Growth: 1,
  Starter: 2,
};

/**
 * List doctors with 2-stage ranking per CONTEXT §2.4:
 * 1. Clinical appropriateness (specialty match) decides eligibility first.
 * 2. Subscription tier (Gold > Growth > Starter) only dictates order among doctors of equal clinical appropriateness.
 */
export async function listDoctors({ specialty = 'all', specialization, search } = {}) {
  const targetSpecialty = specialty || specialization || 'all';
  const doctors = await doctorRepository.findAllActive();

  let filtered = doctors;

  // Search keyword filter across name, specialization, clinicName
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.specialization?.toLowerCase().includes(q) ||
        d.clinicName?.toLowerCase().includes(q)
    );
  }

  // Two-stage sorting:
  // 1. Clinical suitability score: 1 if specialty matches (or if 'all'), 0 if non-matching
  // 2. Tier score: Gold (0) > Growth (1) > Starter (2)
  // 3. Alphabetical name
  const isAll = !targetSpecialty || targetSpecialty.toLowerCase() === 'all';

  const ranked = [...filtered].sort((a, b) => {
    const aMatch = isAll || a.specialization?.toLowerCase() === targetSpecialty.toLowerCase();
    const bMatch = isAll || b.specialization?.toLowerCase() === targetSpecialty.toLowerCase();

    // Clinical appropriateness comes FIRST
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;

    // Among equal clinical suitability: tier priority
    const aTierRank = TIER_ORDER[a.tier] ?? 2;
    const bTierRank = TIER_ORDER[b.tier] ?? 2;
    if (aTierRank !== bTierRank) {
      return aTierRank - bTierRank;
    }

    // Tie-breaker: alphabetical by name
    return (a.name || '').localeCompare(b.name || '');
  });

  // Format doctor helper to always expose isFeatured for Gold tier
  const formatDoctor = (d) => {
    const obj = d.toObject ? d.toObject() : { ...d };
    return {
      ...obj,
      isFeatured: obj.tier === 'Gold',
    };
  };

  // If a specific specialty was queried, return only matching doctors
  const finalDocs = !isAll
    ? ranked.filter((d) => d.specialization?.toLowerCase() === targetSpecialty.toLowerCase())
    : ranked;

  return finalDocs.map(formatDoctor);
}

/**
 * Get doctor by ID
 */
export async function getDoctorById(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND');
  }

  const doctor = await doctorRepository.findById(id);
  if (!doctor || !doctor.isActive) {
    throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND');
  }

  const dObj = doctor.toObject ? doctor.toObject() : { ...doctor };
  return {
    ...dObj,
    isFeatured: dObj.tier === 'Gold',
  };
}

/**
 * Get distinct specialties for directory filter chips
 */
export async function getSpecialties() {
  const list = await doctorRepository.findDistinctSpecialties();
  return list.filter(Boolean);
}

/**
 * Create a consultation appointment per CONTEXT §2.2
 * NMC COMPLIANCE: Records slot and parties only. Strictly NO payment processing.
 */
export async function createAppointment({ patientId, appointmentData }) {
  if (!mongoose.Types.ObjectId.isValid(appointmentData.doctorId)) {
    throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND');
  }

  const doctor = await doctorRepository.findById(appointmentData.doctorId);
  if (!doctor || !doctor.isActive) {
    throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND');
  }

  const slotDate = new Date(appointmentData.slotDateTime);
  if (isNaN(slotDate.getTime())) {
    throw new AppError('Invalid slot date and time', 400, 'INVALID_SLOT_DATETIME');
  }

  const appointment = await consultationRepository.create({
    doctorId: doctor._id,
    patientId,
    slotDateTime: slotDate,
    slotLabel: appointmentData.slotLabel || null,
    notes: appointmentData.notes || '',
    status: 'booked',
  });

  const notice =
    'Pay the doctor directly at the clinic. PathCare charges no booking fee and takes no share of the consultation.';
  const apptObj = appointment.toObject ? appointment.toObject() : appointment;

  return {
    appointment: {
      ...apptObj,
      directPaymentNotice: notice,
    },
    doctor: {
      _id: doctor._id,
      name: doctor.name,
      specialization: doctor.specialization,
      clinicName: doctor.clinicName,
      clinicAddress: doctor.clinicAddress,
      consultationFee: doctor.consultationFee,
    },
    directPaymentNotice: notice,
    paymentNote: notice,
  };
}

/**
 * Get patient's booked appointments
 */
export async function getPatientAppointments(patientId) {
  const list = await consultationRepository.findByPatientId(patientId);
  return list.map((c) => ({
    ...c,
    doctor: c.doctorId,
  }));
}

/**
 * Doctor operational dashboard per CONTEXT §2.2
 * STRICT RULE: Returns COUNTS ONLY (patients referred, reports ready, appointments).
 * Strictly NEVER returns money, earnings, balance, commission, or withdrawal fields.
 */
export async function getDoctorDashboard({ requestedDoctorId, userId, role } = {}) {
  let doctor = null;

  if (role === 'super_admin') {
    // Trusted operator may inspect a named doctor's dashboard.
    if (!requestedDoctorId || !mongoose.Types.ObjectId.isValid(requestedDoctorId)) {
      throw new AppError(
        'A doctorId is required when viewing a doctor dashboard as an administrator',
        400,
        'MISSING_DOCTOR_ID'
      );
    }
    doctor = await doctorRepository.findById(requestedDoctorId);
  } else if (role === 'doctor') {
    // A doctor sees their OWN dashboard only. Any doctorId in the request is
    // ignored: honouring it let any caller read another doctor's referred
    // patients, including their names and phone numbers (CONTEXT §3.2).
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError('Doctor profile not found', 404, 'DOCTOR_NOT_FOUND');
    }
    doctor = await doctorRepository.findByUserId(userId);
  } else {
    throw new AppError('Doctor profile not found', 404, 'DOCTOR_NOT_FOUND');
  }

  // No fallback. Serving the first active doctor's dashboard when a lookup
  // failed disclosed one doctor's patient list to every authenticated caller.
  if (!doctor) {
    throw new AppError('Doctor profile not found', 404, 'DOCTOR_NOT_FOUND');
  }

  // 1. Referral query
  const referralFilter = {
    $or: [
      { 'referralSource.partnerDoctorId': doctor._id },
      ...(doctor.name ? [{ 'referralSource.externalText': new RegExp(doctor.name, 'i') }] : []),
    ],
  };

  const referredBookings = await Booking.find(referralFilter)
    .populate('patientId', 'name phone')
    .populate('familyMemberId', 'name relation')
    .populate('testIds', 'name')
    .populate('packageIds', 'name')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const patientsReferred = Math.max(doctor.referralCount ?? 0, referredBookings.length);
  const reportsReady = referredBookings.filter((b) => b.status === 'report_ready').length;

  // 2. Appointments query
  const appointmentsCount = await consultationRepository.countByDoctorId(doctor._id);
  const appointmentsList = await consultationRepository.findByDoctorId(doctor._id);

  const kpis = {
    patientsReferred,
    reportsReady,
    appointments: appointmentsCount,
  };

  const regulatoryNotice =
    'PathCare takes no share of your consultation fee, and pays no referral commission. Never. Patients pay you directly at your clinic. The platform subscription is free while we build the Dehradun network.';

  // Return strictly counts and zero money fields
  return {
    doctor: {
      _id: doctor._id,
      name: doctor.name,
      specialization: doctor.specialization,
      clinicName: doctor.clinicName,
      clinicAddress: doctor.clinicAddress,
      tier: doctor.tier,
      referralCount: doctor.referralCount ?? 0,
    },
    kpis,
    counts: kpis,
    referredBookings: referredBookings.map((b) => ({
      _id: b._id,
      who: b.familyMemberId?.name || b.patientId?.name || 'Patient',
      test: b.testIds?.[0]?.name || b.packageId?.name || 'Diagnostic Test',
      status: b.status,
      createdAt: b.createdAt,
    })),
    appointmentsList,
    regulatoryNotice,
    notice: regulatoryNotice,
  };
}

/**
 * Submit partner application (Doctor or Lab)
 */
export async function submitPartnerApplication(applicationData) {
  const application = await partnerApplicationRepository.create(applicationData);
  const appObj = application.toObject ? application.toObject() : { ...application };
  return {
    ...appObj,
    callbackPromise: 'Our partnerships team will call you within 2 working days to verify your details.',
  };
}

export default {
  listDoctors,
  getDoctorById,
  getSpecialties,
  createAppointment,
  getPatientAppointments,
  getDoctorDashboard,
  submitPartnerApplication,
};

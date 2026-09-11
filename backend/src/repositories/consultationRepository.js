import { Consultation } from '../schemas/Consultation.js';

export async function create(consultationData) {
  return Consultation.create(consultationData);
}

export async function findByDoctorId(doctorId) {
  return Consultation.find({ doctorId })
    .populate('patientId', 'name phone')
    .sort({ slotDateTime: -1 })
    .lean();
}

export async function findByPatientId(patientId) {
  return Consultation.find({ patientId })
    .populate('doctorId', 'name qualification specialization clinicName clinicAddress consultationFee tier')
    .sort({ slotDateTime: -1 })
    .lean();
}

export async function countByDoctorId(doctorId) {
  return Consultation.countDocuments({ doctorId });
}

export default {
  create,
  findByDoctorId,
  findByPatientId,
  countByDoctorId,
};

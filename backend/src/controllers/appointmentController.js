import doctorService from '../services/doctorService.js';
import { createAppointmentSchema } from '@pathcare/validators';

export async function createAppointment(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const validatedData = createAppointmentSchema.parse(req.body);

    const result = await doctorService.createAppointment({
      patientId,
      appointmentData: validatedData,
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully. Pay directly at the clinic.',
      data: result.appointment,
      doctor: result.doctor,
      paymentNote: result.paymentNote,
    });
  } catch (error) {
    next(error);
  }
}

export async function listPatientAppointments(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const appointments = await doctorService.getPatientAppointments(patientId);
    res.status(200).json({
      success: true,
      data: appointments,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  createAppointment,
  listPatientAppointments,
};

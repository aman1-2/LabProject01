import doctorService from '../services/doctorService.js';
import { doctorQuerySchema } from '@pathcare/validators';

export async function getDoctors(req, res, next) {
  try {
    const validatedQuery = doctorQuerySchema.parse(req.query);
    const doctors = await doctorService.listDoctors(validatedQuery);
    res.status(200).json({
      success: true,
      data: doctors,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDoctorById(req, res, next) {
  try {
    const doctor = await doctorService.getDoctorById(req.params.id);
    res.status(200).json({
      success: true,
      data: doctor,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSpecialties(req, res, next) {
  try {
    const specialties = await doctorService.getSpecialties();
    res.status(200).json({
      success: true,
      data: specialties,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDoctorDashboard(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    // requestedDoctorId is honoured for super_admin only; the service ignores it
    // for a doctor, who always sees their own dashboard.
    const dashboard = await doctorService.getDoctorDashboard({
      requestedDoctorId: req.query.doctorId,
      userId,
      role: req.user?.role,
    });
    res.status(200).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getDoctors,
  getDoctorById,
  getSpecialties,
  getDoctorDashboard,
};

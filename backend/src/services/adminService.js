import Booking from '../schemas/Booking.js';
import LabCenter from '../schemas/LabCenter.js';
import Doctor from '../schemas/Doctor.js';
import Rider from '../schemas/Rider.js';
import AppError from '../utils/AppError.js';

/**
 * List all bookings across all lab centres with filtering and pagination
 */
export async function listAllBookings({ status, limit = 50, skip = 0 } = {}) {
  const query = {};
  if (status && status !== 'all') {
    query.status = status;
  }

  const bookings = await Booking.find(query)
    .populate('patientId', 'name phone accountHandle')
    .populate('labCenterId', 'name area')
    .populate('testIds', 'name basePrice')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Booking.countDocuments(query);

  return { bookings, total };
}

/**
 * List all lab centres with accreditation, verification status, and booking volume
 */
export async function listAllLabs() {
  const labs = await LabCenter.find({}).sort({ name: 1 });

  // Compute booking count for each lab
  const bookingCounts = await Booking.aggregate([
    { $group: { _id: '$labCenterId', count: { $sum: 1 } } },
  ]);

  const countMap = new Map();
  bookingCounts.forEach((bc) => {
    if (bc._id) countMap.set(bc._id.toString(), bc.count);
  });

  return labs.map((lab) => {
    const labObj = lab.toObject();
    labObj.bookingCount = countMap.get(lab._id.toString()) || 0;
    return labObj;
  });
}

/**
 * Update verification status of a lab centre
 */
export async function verifyLab(labId, isVerified = true) {
  const lab = await LabCenter.findById(labId);
  if (!lab) {
    throw new AppError('Lab centre not found', 404, 'LAB_NOT_FOUND');
  }

  lab.isVerified = Boolean(isVerified);
  await lab.save();

  return lab;
}

/**
 * List all riders with collection metrics
 */
export async function listAllRiders() {
  const riders = await Rider.find({})
    .populate('userId', 'name phone accountHandle')
    .populate('labCenterId', 'name area')
    .sort({ createdAt: -1 });

  // Count samples collected by each rider
  // In Sample model or Booking with assignedRiderId & status >= collected
  const riderIds = riders.map((r) => r._id);
  const collectedCounts = await Booking.aggregate([
    {
      $match: {
        assignedRiderId: { $in: riderIds },
        status: { $in: ['collected', 'at_lab', 'report_ready'] },
      },
    },
    { $group: { _id: '$assignedRiderId', count: { $sum: 1 } } },
  ]);

  const countMap = new Map();
  collectedCounts.forEach((cc) => {
    if (cc._id) countMap.set(cc._id.toString(), cc.count);
  });

  return riders.map((r) => {
    const rObj = r.toObject();
    rObj.samplesCollected = countMap.get(r._id.toString()) || 0;
    return rObj;
  });
}

/**
 * List all partner doctors with plan/tier, referral count, and verification
 */
export async function listAllDoctors() {
  const doctors = await Doctor.find({})
    .sort({ referralCount: -1, createdAt: -1 });

  return doctors;
}

/**
 * Update verification status of a partner doctor
 */
export async function verifyDoctor(doctorId, isVerified = true) {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND');
  }

  doctor.isVerified = Boolean(isVerified);
  await doctor.save();

  return doctor;
}

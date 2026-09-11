import { Booking } from '../schemas/Booking.js';

export class BookingRepository {
  /**
   * Find booking by idempotency key
   * @param {string} idempotencyKey
   * @returns {Promise<Booking|null>}
   */
  async findByIdempotencyKey(idempotencyKey) {
    return Booking.findOne({ idempotencyKey })
      .populate('testIds')
      .populate('packageIds')
      .populate('labCenterId')
      .populate('familyMemberId', 'name relation age gender')
      .populate('referralSource.partnerDoctorId');
  }

  /**
   * Create a new booking
   * @param {Object} bookingData
   * @returns {Promise<Booking>}
   */
  async create(bookingData) {
    const booking = new Booking(bookingData);
    return booking.save();
  }

  /**
   * Find all bookings for a patient ordered newest first
   * @param {string} patientId
   * @param {Object} [options]
   * @returns {Promise<Array<Booking>>}
   */
  async findByPatientId(patientId, { limit = 50, skip = 0 } = {}) {
    return Booking.find({ patientId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('testIds', 'name slug category sampleType turnaroundHrs')
      .populate('packageIds', 'name slug category turnaroundHrs')
      .populate('familyMemberId', 'name relation age gender')
      .populate('labCenterId', 'name area address phone');
  }

  /**
   * Find a booking by its primary ID
   * @param {string} id
   * @returns {Promise<Booking|null>}
   */
  async findById(id) {
    return Booking.findById(id)
      .populate('testIds', 'name slug category sampleType turnaroundHrs prepInstructions homeCollectionAvailable')
      .populate('packageIds', 'name slug category turnaroundHrs prepInstructions')
      .populate('familyMemberId', 'name relation age gender')
      .populate('labCenterId', 'name area address geo contactPhone isVerified accreditation')
      .populate('referralSource.partnerDoctorId', 'name specialization clinicName phone');
  }
}

export const bookingRepository = new BookingRepository();
export default bookingRepository;

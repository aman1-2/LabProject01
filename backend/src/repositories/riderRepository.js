// backend/src/repositories/riderRepository.js
import Rider from '../schemas/Rider.js';

export class RiderRepository {
  /**
   * Find a rider by their linked User ID
   */
  async findByUserId(userId) {
    return Rider.findOne({ userId }).populate('userId', 'name phone email role').populate('labCenterId');
  }

  /**
   * Find a rider by their Rider document ID
   */
  async findById(riderId) {
    return Rider.findById(riderId).populate('userId', 'name phone email role').populate('labCenterId');
  }

  /**
   * Create a new rider record
   */
  async create(riderData) {
    return Rider.create(riderData);
  }

  /**
   * Atomic Rider Claim (CONTEXT §6.1)
   * Must use atomic findOneAndUpdate with status: 'available' in the filter.
   * If claimed by another concurrent booking, returns null.
   */
  async claimRiderAtomic({ riderId, bookingId, session = null }) {
    const options = { new: true };
    if (session) {
      options.session = session;
    }

    return Rider.findOneAndUpdate(
      {
        _id: riderId,
        status: 'available',
      },
      {
        $set: {
          status: 'assigned',
          currentBookingId: bookingId,
        },
      },
      options
    );
  }

  /**
   * Release a rider back to available status
   */
  async releaseRider({ riderId, session = null }) {
    const options = { new: true };
    if (session) {
      options.session = session;
    }

    return Rider.findOneAndUpdate(
      { _id: riderId },
      {
        $set: {
          status: 'available',
          currentBookingId: null,
        },
      },
      options
    );
  }

  /**
   * Update rider operational status ('available' | 'offline')
   */
  async updateStatus({ riderId, status }) {
    return Rider.findOneAndUpdate(
      { _id: riderId },
      { $set: { status } },
      { new: true }
    );
  }

  /**
   * Set kit ID or training certification
   */
  async updateDetails(riderId, updateData) {
    return Rider.findByIdAndUpdate(riderId, { $set: updateData }, { new: true });
  }
}

export const riderRepository = new RiderRepository();
export default riderRepository;

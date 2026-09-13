import { Sample } from '../schemas/Sample.js';

export class SampleRepository {
  /**
   * Create a new physical sample record
   * @param {Object} sampleData
   * @returns {Promise<Sample>}
   */
  async createSample(sampleData) {
    const sample = new Sample(sampleData);
    return sample.save();
  }

  /**
   * Find sample by unique barcode
   * @param {string} barcode
   * @returns {Promise<Sample|null>}
   */
  async findByBarcode(barcode) {
    if (!barcode) return null;
    return Sample.findOne({ barcode: barcode.trim().toUpperCase() })
      .populate('coldChainLog.recordedBy', 'name role')
      .populate('bookingId');
  }

  /**
   * Find sample by associated booking ID
   * @param {string|import('mongoose').Types.ObjectId} bookingId
   * @returns {Promise<Sample|null>}
   */
  async findByBookingId(bookingId) {
    if (!bookingId) return null;
    return Sample.findOne({ bookingId })
      .populate('coldChainLog.recordedBy', 'name role');
  }

  /**
   * Atomically append a cold-chain telemetry reading to a sample
   * CRITICAL: Append-only, never overwrites earlier readings
   * @param {string|import('mongoose').Types.ObjectId} bookingId
   * @param {Object} reading - { temperature, recordedAt, recordedBy, notes }
   * @returns {Promise<Sample|null>}
   */
  async appendColdChainReading(bookingId, reading) {
    return Sample.findOneAndUpdate(
      { bookingId },
      {
        $push: {
          coldChainLog: reading,
        },
      },
      { new: true }
    ).populate('coldChainLog.recordedBy', 'name role');
  }

  /**
   * Update handoff timestamp and optionally append a cold-chain reading
   * @param {Object} params
   * @param {string|import('mongoose').Types.ObjectId} params.bookingId
   * @param {string} params.timestampKey - e.g. 'submittedAt', 'labReceivedAt'
   * @param {Date} [params.date=new Date()]
   * @param {Object} [params.coldChainReading]
   * @returns {Promise<Sample|null>}
   */
  async updateHandoff({ bookingId, timestampKey, date = new Date(), coldChainReading = null }) {
    const update = {
      $set: {
        [`handoffTimestamps.${timestampKey}`]: date,
      },
    };

    if (coldChainReading) {
      update.$push = {
        coldChainLog: coldChainReading,
      };
    }

    return Sample.findOneAndUpdate({ bookingId }, update, { new: true })
      .populate('coldChainLog.recordedBy', 'name role');
  }
}

export const sampleRepository = new SampleRepository();
export default sampleRepository;

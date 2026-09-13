import { Report } from '../schemas/Report.js';

export class ReportRepository {
  /**
   * Create a new Report record
   * @param {Object} reportData
   * @returns {Promise<Report>}
   */
  async createReport(reportData, session = null) {
    const report = new Report(reportData);
    return report.save({ session });
  }

  /**
   * Find Report by booking ID
   * @param {string|import('mongoose').Types.ObjectId} bookingId
   * @returns {Promise<Report|null>}
   */
  async findByBookingId(bookingId) {
    if (!bookingId) return null;
    return Report.findOne({ bookingId })
      .populate('authoredBy', 'name role accountHandle')
      .populate('approvedBy', 'name role')
      .populate('recommendedDoctorId', 'name specialization clinicName clinicAddress consultationFee tier');
  }

  /**
   * Update report and atomically append to editHistory (append-only guarantee §2.4)
   * @param {string|import('mongoose').Types.ObjectId} bookingId
   * @param {Object} updateFields
   * @param {Object} historyEntry
   * @returns {Promise<Report|null>}
   */
  async updateReportAndAppendHistory(bookingId, updateFields, historyEntry, session = null) {
    const update = {
      $set: updateFields,
    };

    if (historyEntry) {
      update.$push = {
        editHistory: historyEntry,
      };
    }

    return Report.findOneAndUpdate({ bookingId }, update, { new: true, ...(session ? { session } : {}) })
      .populate('authoredBy', 'name role accountHandle')
      .populate('approvedBy', 'name role')
      .populate('recommendedDoctorId', 'name specialization clinicName clinicAddress consultationFee tier');
  }
}

export const reportRepository = new ReportRepository();
export default reportRepository;

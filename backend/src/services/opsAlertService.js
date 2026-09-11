// backend/src/services/opsAlertService.js
import logger from '../utils/logger.js';

export class OpsAlertService {
  constructor() {
    this.alerts = [];
  }

  /**
   * Surface unassigned booking to operations console
   * Never fail silently (CONTEXT §6.1 / P05 requirement)
   */
  async surfaceUnassignedBooking({ bookingId, labCenterId, searchRadiusKm, reason }) {
    const alertRecord = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'UNASSIGNED_RIDER',
      bookingId: bookingId ? bookingId.toString() : null,
      labCenterId: labCenterId ? labCenterId.toString() : null,
      searchRadiusKm,
      reason: reason || 'No phlebotomist candidates available within maximum radius',
      timestamp: new Date().toISOString(),
      status: 'open',
    };

    this.alerts.push(alertRecord);

    logger.error('CRITICAL OPS ALERT: Booking requires manual rider assignment', alertRecord);

    return alertRecord;
  }

  /**
   * Get all active alerts
   */
  getAlerts() {
    return [...this.alerts];
  }

  /**
   * Clear alerts (testing utility)
   */
  clearAlerts() {
    this.alerts = [];
  }
}

export const opsAlertService = new OpsAlertService();
export default opsAlertService;

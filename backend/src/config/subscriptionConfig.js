/**
 * Subscription tunables.
 *
 * CONTEXT §3.4: no magic numbers in business logic. Every value here is
 * environment-overridable so a change is a deploy variable, not a code change.
 */
export const SUBSCRIPTION_CONFIG = {
  /** Cadence offered in the UI. 90 days is the quarterly care plan. */
  get allowedFrequencyDays() {
    const raw = process.env.SUBSCRIPTION_ALLOWED_FREQUENCY_DAYS;
    if (!raw) return [30, 60, 90, 180, 365];
    return raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
  },

  get defaultFrequencyDays() {
    return Number(process.env.SUBSCRIPTION_DEFAULT_FREQUENCY_DAYS) || 90;
  },

  /**
   * Cycles a single mandate covers. Razorpay requires a total_count; this is a
   * ceiling, not a commitment — cancelling early is always allowed.
   */
  get maxCyclesPerMandate() {
    return Number(process.env.SUBSCRIPTION_MAX_CYCLES) || 24;
  },

  /**
   * RBI requires the customer be notified at least 24 hours before each
   * recurring debit. This is a COMPLIANCE FLOOR, not a preference: sending
   * later than this makes the debit itself non-compliant, so the sweep window
   * is deliberately wider than the minimum to absorb a late or skipped run.
   */
  get preDebitNoticeHours() {
    return Number(process.env.SUBSCRIPTION_PREDEBIT_NOTICE_HOURS) || 24;
  },

  /**
   * How far past the notice point the sweep still looks. Without a lower bound
   * a sweep that misses its slot never notifies at all, and the debit goes out
   * with no notice — worse than notifying slightly late.
   */
  get preDebitWindowHours() {
    return Number(process.env.SUBSCRIPTION_PREDEBIT_WINDOW_HOURS) || 48;
  },

  /** How often the sweep runs. */
  get sweepIntervalMs() {
    return Number(process.env.SUBSCRIPTION_SWEEP_INTERVAL_MS) || 60 * 60 * 1000;
  },
};

export default SUBSCRIPTION_CONFIG;

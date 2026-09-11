// backend/src/config/businessConfig.js
// Platform business rules and operational parameters per PATHCARE_CONTEXT.md

export const BUSINESS_CONFIG = {
  // Cancellation fee in INR deducted from refund / charged to patient (CONTEXT §6.4)
  cancellationFee: 20,

  // Default auto-cancellation window for lab visit bookings (slotDateTime + 8 hours) (CONTEXT §3.1, §5.1)
  autoCancelWindowHours: 8,

  // Rider search radius for home collection matching (CONTEXT §6.2)
  riderSearchRadiusKm: 5,

  // Maximum expansion radius for rider matching fallback (CONTEXT §6.1)
  maxRiderSearchRadiusKm: 20,

  // Throttle window for rider location pings (seconds)
  riderLocationThrottleSeconds: 10,

  // OTP TTL for specimen collection confirmation (CONTEXT §6.1)
  otpTtlSeconds: 60,
};

export default BUSINESS_CONFIG;

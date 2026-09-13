export const BUSINESS_CONFIG = {
  // Cancellation fee in INR deducted from refund / charged to patient
  cancellationFee: 20,

  // Default auto-cancellation window for lab visit bookings (slotDateTime + 8 hours)
  autoCancelWindowHours: 8,

  // Rider search radius for home collection matching
  riderSearchRadiusKm: 5,

  // Maximum expansion radius for rider matching fallback
  maxRiderSearchRadiusKm: 20,

  // Throttle window for rider location pings (seconds)
  riderLocationThrottleSeconds: 10,

  // OTP TTL for specimen collection confirmation
  otpTtlSeconds: 60,
};

export default BUSINESS_CONFIG;

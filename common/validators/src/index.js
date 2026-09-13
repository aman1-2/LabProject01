import { z } from 'zod';

// Re-export zod
export { z };

// Account handle validation (3-30 chars, lowercase, alphanumeric and underscores)
export const accountHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Account handle must be at least 3 characters')
  .max(30, 'Account handle cannot exceed 30 characters')
  .regex(/^[a-z0-9_]+$/, 'Account handle can only contain lowercase letters, numbers, and underscores');

// Indian mobile number validation (10 digits starting with 6-9)
export const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number');

// Strong password validation (at least 8 chars, 1 letter, 1 number)
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// User location schema per §5.1
export const locationSchema = z.object({
  lat: z.number({ required_error: 'Latitude is required' }),
  lng: z.number({ required_error: 'Longitude is required' }),
  address: z.string().min(1, 'Address is required'),
  source: z.enum(['geo', 'manual'], { required_error: 'Location source must be geo or manual' }),
});

// Full signup validation schema
export const signupSchema = z.object({
  accountHandle: accountHandleSchema,
  phone: phoneSchema,
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: passwordSchema,
  accountType: z.enum(['single', 'family']).default('single'),
  location: locationSchema,
});

// Login with password schema
export const loginPasswordSchema = z.object({
  accountHandle: accountHandleSchema,
  password: z.string().min(1, 'Password is required'),
});

// Login with OTP request schema
export const loginOtpRequestSchema = z.object({
  phone: phoneSchema,
});

// Verify OTP schema
export const verifyOtpSchema = z.object({
  otpToken: z.string().min(1, 'OTP token is required'),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

// Check handle availability schema
export const handleAvailableSchema = z.object({
  handle: accountHandleSchema,
});

// Generic schemas
export const emptySchema = z.object({});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

// Catalogue query schema (public browsing)
export const testCategoryEnum = z.enum(['single', 'package', 'imaging', 'plan', 'all']);

export const testQuerySchema = z.object({
  category: testCategoryEnum.default('all'),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const testSlugSchema = z.object({
  slug: z.string().trim().min(1, 'Test slug is required'),
});

// Nearby labs query schema
export const nearbyLabsQuerySchema = z.object({
  lat: z.coerce.number({ required_error: 'Latitude is required' }),
  lng: z.coerce.number({ required_error: 'Longitude is required' }),
  testId: z.string().min(1, 'Test ID or slug is required'),
  maxDistanceKm: z.coerce.number().positive().default(50),
});

// Referral source schema per CONTEXT §5.1
export const referralSourceSchema = z.object({
  type: z.enum(['partner', 'external', 'none']).default('none'),
  partnerDoctorId: z.string().optional().nullable(),
  externalText: z.string().max(200).optional().nullable(),
  doctorName: z.string().max(200).optional().nullable(),
}).default({ type: 'none' });

// Booking creation schema per CONTEXT §5.1 & §3.1
export const createBookingSchema = z.object({
  familyMemberId: z.string().optional().nullable(),
  testIds: z.array(z.string()).default([]),
  packageIds: z.array(z.string()).optional().default([]),
  // Accepted for compatibility and folded into `packageIds` server-side. The
  // mobile app still sends this shape, and a write path that breaks halfway
  // through a rollout is not worth the tidiness.
  packageId: z.string().optional().nullable(),
  labCenterId: z.string({ required_error: 'labCenterId is required' }).min(1, 'labCenterId is required'),
  mode: z.enum(['home', 'visit'], { required_error: 'mode must be home or visit' }),
  slotDateTime: z.coerce.date({ required_error: 'slotDateTime is required' }),
  paymentMode: z.enum(['upi', 'cash']).default('upi'),
  referralSource: referralSourceSchema.optional().default({ type: 'none' }),
  amount: z.number().optional(), // Client-supplied amount ignored server-side
  // Home collection needs somewhere to collect FROM. The server resolves this
  // against the caller's own address book and snapshots it onto the booking;
  // an address the caller does not own is rejected (CONTEXT §3.2).
  addressId: z.string().optional().nullable(),
}).refine(
  (data) =>
    (data.testIds && data.testIds.length > 0) ||
    (data.packageIds && data.packageIds.length > 0) ||
    Boolean(data.packageId),
  { message: 'At least one testId or package must be provided', path: ['testIds'] }
).refine(
  (data) => data.mode !== 'home' || Boolean(data.addressId),
  { message: 'addressId is required for home collection', path: ['addressId'] }
);

// Physical-sample collection schema per §5.1
export const sampleCollectSchema = z.object({
  temperature: z.coerce.number().min(-30).max(60).optional(),
  notes: z.string().max(300).optional(),
});

// Rider cash confirmation schema
export const cashReceivedSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  notes: z.string().max(200).optional(),
});

// Sample lab submission schema
export const sampleSubmittedSchema = z.object({
  temperature: z.coerce.number().min(-30).max(60).optional(),
  notes: z.string().max(300).optional(),
});

// Lab report upload URL request schema
export const uploadUrlSchema = z.object({
  contentType: z.string().default('application/pdf'),
  fileName: z.string().optional(),
});

// Lab report publish schema
export const publishReportSchema = z.object({
  pdfKey: z.string({ required_error: 'pdfKey is required' }).min(1, 'pdfKey is required'),
  summaryHtml: z.string({ required_error: 'summaryHtml is required' }).min(1, 'summaryHtml cannot be empty'),
  recommendedDoctorId: z.string().optional().nullable(),
  recommendationReason: z.string().max(500).optional().nullable(),
  approvedBy: z.string().optional().nullable(),
});

// Lab queue query schema
export const labQueueQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});
// Family member schemas per CONTEXT §5.1 & §3.6
export const createFamilyMemberSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(1, 'Name cannot be empty').max(100),
  relation: z.string({ required_error: 'Relation is required' }).trim().min(1, 'Relation cannot be empty').max(50),
  age: z.coerce.number({ required_error: 'Age is required' }).int().min(0, 'Age must be non-negative').max(125, 'Age must be 125 or less'),
  gender: z.enum(['male', 'female', 'other']).default('other'),
});

export const updateFamilyMemberSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
  relation: z.string().trim().min(1, 'Relation cannot be empty').max(50).optional(),
  age: z.coerce.number().int().min(0).max(125).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

// Address schemas per CONTEXT §5.1
export const createAddressSchema = z.object({
  label: z.enum(['Home', 'Work', 'Other']).default('Home'),
  line: z.string({ required_error: 'Address line is required' }).trim().min(3, 'Address line must be at least 3 characters').max(300),
  pincode: z.string({ required_error: 'Pincode is required' }).regex(/^\d{6}$/, 'Please enter a valid 6-digit Indian pincode'),
  lat: z.coerce.number().optional().default(30.3165),
  lng: z.coerce.number().optional().default(78.0322),
  isDefault: z.boolean().optional().default(false),
});

export const updateAddressSchema = z.object({
  label: z.enum(['Home', 'Work', 'Other']).optional(),
  line: z.string().trim().min(3, 'Address line must be at least 3 characters').max(300).optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Please enter a valid 6-digit Indian pincode').optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  isDefault: z.boolean().optional(),
});

// Booking reschedule schema
export const rescheduleBookingSchema = z.object({
  slotDateTime: z.coerce.date({ required_error: 'New slot date and time is required' }).refine(
    (date) => date.getTime() > Date.now(),
    { message: 'Rescheduled slot must be in the future' }
  ),
});

// Booking cancel schema
export const cancelBookingSchema = z.object({
  reason: z.string().max(300).optional().default('Cancelled by patient'),
});

// User profile update schema
export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  phone: phoneSchema.optional(),
  location: z
    .object({
      lat: z.number().optional(),
      lng: z.number().optional(),
      address: z.string().min(1, 'Address is required').optional(),
      source: z.enum(['geo', 'manual']).optional().default('manual'),
    })
    .optional(),
});

// Appointment creation schema per CONTEXT §2.2 (No payment fields)
export const createAppointmentSchema = z.object({
  doctorId: z.string({ required_error: 'Doctor ID is required' }),
  slotDateTime: z.coerce.date({ required_error: 'Slot date and time is required' }),
  slotLabel: z.string().optional(),
  notes: z.string().max(500).optional().default(''),
});

// Partner application schema per prototype lines 771-786
export const partnerApplicationSchema = z.object({
  type: z.enum(['doctor', 'lab'], { required_error: 'Type must be doctor or lab' }),
  name: z.string({ required_error: 'Full name is required' }).trim().min(2, 'Name must be at least 2 characters'),
  regNumber: z.string().trim().optional().default(''),
  facilityName: z.string({ required_error: 'Clinic or laboratory name is required' }).trim().min(2),
  specialityOrServices: z.string({ required_error: 'Speciality or services offered is required' }).trim().min(2),
  area: z.string({ required_error: 'Area is required' }).trim().min(2),
  phone: phoneSchema,
  notes: z.string().max(1000).optional().default(''),
});

// Doctor directory query schema
export const doctorQuerySchema = z.object({
  specialty: z.string().optional(),
  specialization: z.string().optional(),
  search: z.string().optional(),
});

// Admin referral lead update schema
export const updateReferralLeadSchema = z.object({
  status: z
    .enum(['New', 'Contacted', 'In discussion', 'Converted', 'Declined'])
    .optional(),
  notes: z.string().max(2000).optional(),
});

// Admin referral leads query schema
export const referralLeadQuerySchema = z.object({
  status: z.string().optional().default('all'),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

// Feedback submission schema per CONTEXT §5.1 & prototype line 988
export const createFeedbackSchema = z.object({
  bookingId: z.string({ required_error: 'bookingId is required' }).min(1, 'bookingId is required'),
  text: z.string().max(2000).optional().default(''),
  pickAndDropInterest: z.union([z.boolean(), z.number()]).optional().default(0),
  rating: z.coerce.number().min(1).max(5).optional().default(5),
});

// Verification status toggle schema
export const verifyStatusSchema = z.object({
  isVerified: z.boolean().optional().default(true),
});


// ── Subscriptions (recurring test packages) ────────────────────────────────

export const createSubscriptionSchema = z
  .object({
    packageId: z.string({ required_error: 'packageId is required' }).min(1),
    labCenterId: z.string({ required_error: 'labCenterId is required' }).min(1),
    // Constrained server-side against SUBSCRIPTION_CONFIG.allowedFrequencyDays;
    // this is only the shape check.
    frequencyDays: z.coerce.number().int().positive().optional(),
    mode: z.enum(['home', 'visit']).default('home'),
    addressId: z.string().optional().nullable(),
    // No amount field on purpose. A mandate's amount is computed server-side
    // from the live catalogue; accepting one from the client would let the
    // caller choose what they are billed (CONTEXT §3.2).
  })
  .refine((data) => data.mode !== 'home' || Boolean(data.addressId), {
    message: 'addressId is required for home collection',
    path: ['addressId'],
  });

export const cancelSubscriptionSchema = z.object({
  reason: z.string().max(300).optional().nullable(),
});


// ── Cart quote (pricing a basket before it becomes a booking) ──────────────

/**
 * A cart is a list of catalogue references and, optionally, the lab to price
 * them at. There is deliberately NO amount, price, or total in this schema:
 * accepting any of them would let the caller propose what they are charged,
 * which is the defect CONTEXT §3.2 exists to prevent. The server computes
 * every figure from the live catalogue.
 */
export const cartQuoteSchema = z.object({
  // Slugs or ObjectIds — the catalogue resolves either, so the web cart can
  // send the slugs it stores without a lookup round trip first.
  items: z
    .array(z.string().min(1, 'Item reference cannot be empty'))
    .min(1, 'Add at least one test to get a price')
    .max(20, 'A single booking can hold at most 20 items'),
  labCenterId: z.string().min(1).optional().nullable(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});


// ── Changing your own password ─────────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Your current password is required'),
  // The same rules any password must satisfy; a forced change must not be an
  // opportunity to set something weaker than signup would have allowed.
  newPassword: passwordSchema,
});


// ── Super-admin provisioning ───────────────────────────────────────────────
//
// No password field anywhere below. The server generates it and returns it
// once; a caller-supplied password would be one the admin keeps a copy of,
// and would let a weak one be set for an account that can read patient data.

export const createLabCentreSchema = z.object({
  name: z.string().min(2, 'Centre name is required').max(120),
  area: z.string().min(2, 'Area is required').max(120),
  address: z.string().min(5, 'Full address is required').max(300),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  // Bounded here AND in the service. This multiplies every test price at the
  // centre, so 15 typed for 1.5 is a ten-fold overcharge on every bill.
  priceMultiplier: z.coerce.number().min(0.5).max(2.0).default(1.0),
  turnaroundHrs: z.coerce.number().int().min(1).max(168).default(24),
  accreditation: z
    .object({ nabl: z.boolean().default(false), iso: z.boolean().default(false) })
    .default({ nabl: false, iso: false }),
});

const staffIdentitySchema = {
  accountHandle: accountHandleSchema,
  name: z.string().min(2, 'Full name is required').max(120),
  phone: phoneSchema,
};

export const createDoctorAccountSchema = z.object({
  ...staffIdentitySchema,
  specialization: z.string().min(2, 'Specialisation is required').max(120),
  clinicName: z.string().min(2, 'Clinic name is required').max(160),
  // Optional, but it is the only way a real address ever reaches the record:
  // nothing derives one, and the schema no longer invents a city.
  clinicAddress: z.string().min(4).max(240).optional().nullable(),
  consultationFee: z.coerce.number().min(0).max(100000),
  walkInFee: z.coerce.number().min(0).max(100000),
  qualification: z.string().max(160).optional().nullable(),
  experienceYears: z.coerce.number().int().min(0).max(70).optional().nullable(),
});

export const createRiderAccountSchema = z.object({
  ...staffIdentitySchema,
  labCenterId: z.string().min(1, 'A lab centre is required'),
  kitId: z.string().max(60).optional().nullable(),
});

export const createLabAdminAccountSchema = z.object({
  ...staffIdentitySchema,
  labCenterId: z.string().min(1, 'A lab centre is required'),
});

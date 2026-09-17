import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar.jsx';
import WhatsAppFab from '../components/layout/WhatsAppFab.jsx';
import Card from '../components/atoms/Card.jsx';
import Button from '../components/atoms/Button.jsx';
import EmptyState from '../components/atoms/EmptyState.jsx';
import Skeleton from '../components/atoms/Skeleton.jsx';
import Modal from '../components/atoms/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useQuery } from '@tanstack/react-query';
import { fetchTestBySlug, fetchNearbyLabs, fetchDoctors, fetchCartQuote } from '@pathcare/api';
import { useCart } from '../context/CartContext.jsx';
import Icon from '../components/atoms/Icon.jsx';

import { CITY, DEFAULT_LAT, DEFAULT_LNG } from '../lib/locale.js';
export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, api, updateUser } = useAuth();

  const { items: cartItems, clear: clearCart } = useCart();

  const testSlug = searchParams.get('testId') || searchParams.get('slug') || '';
  const initialMode = searchParams.get('mode') === 'visit' ? 'visit' : 'home';

  /**
   * What are we booking?
   *
   * A slug in the URL wins — "book this one test" from a test page must not be
   * silently widened into whatever else is sitting in the cart. With no slug
   * we are here from the cart, so we book everything in it.
   *
   * Joined into a string so the load effect has a stable dependency; an array
   * literal would be a new reference on every render and re-fetch forever.
   */
  const slugKey = testSlug || cartItems.map((item) => item.slug).join(',');
  const fromCart = !testSlug && cartItems.length > 0;

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Catalogue data
  const [test, setTest] = useState(null);
  // Everything in this booking. `test` stays the first one, because the page's
  // headline, sample type and preparation notes are all singular.
  const [tests, setTests] = useState([]);
  const [partnerDoctors, setPartnerDoctors] = useState([]);

  // Booking Draft State
  const [mode, setMode] = useState(initialMode);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('self'); // 'self' | memberId
  const [familyMembers, setFamilyMembers] = useState([]);
  const [, setLoadingMembers] = useState(false);

  // Add Member Modal on Booking page
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRelation, setAddRelation] = useState('');
  const [addAge, setAddAge] = useState('');
  const [addGender, setAddGender] = useState('other');
  const [addMemberSubmitting, setAddMemberSubmitting] = useState(false);
  const [addMemberError, setAddMemberError] = useState(null);

  const [selectedLabId, setSelectedLabId] = useState('');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('08:00 AM');

  const [referralType, setReferralType] = useState('none'); // 'none' | 'partner' | 'external'
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [externalDoctorText, setExternalDoctorText] = useState('');

  const [paymentMode, setPaymentMode] = useState('upi'); // 'upi' | 'cash'

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // Generate slot days for the next 5 days
  const days = React.useMemo(() => {
    const list = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayNames[d.getDay()];
      const sub = `${d.getDate()} ${monthNames[d.getMonth()]}`;
      list.push({ date: d, label, sub });
    }
    return list;
  }, []);

  const timeSlots = ['07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '04:00 PM', '05:00 PM'];

  // Load test details, labs, and partner doctors
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const slugs = slugKey ? slugKey.split(',').filter(Boolean) : [];

      if (slugs.length === 0) {
        setError('No test specified for booking. Please pick a test from catalogue.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Re-fetched from the catalogue rather than read out of the cart: the
        // cart holds display prices that may be days old, and nothing here may
        // depend on a number the client is carrying around (CONTEXT §3.2).
        const loadedTests = await Promise.all(slugs.map((slug) => fetchTestBySlug(slug)));
        if (!isMounted) return;

        const testData = loadedTests[0];
        setTests(loadedTests);
        setTest(testData);

        // One booking, one mode. If ANY test needs lab equipment, the whole
        // booking is a lab visit — the server enforces this too and would
        // reject the booking otherwise.
        const everyTestGoesHome = loadedTests.every((item) => item.homeCollectionAvailable);
        const resolvedMode = everyTestGoesHome ? initialMode : 'visit';
        setMode(resolvedMode);

        // Fetch partner doctors
        try {
          const docs = await fetchDoctors({}, api);
          if (isMounted && docs) {
            setPartnerDoctors(docs);
          }
        } catch {
          // Non-blocking fallback for partner doctors
        }

        // Fetch registered family members
        try {
          setLoadingMembers(true);
          const famRes = await api.get('/api/family-members');
          if (isMounted) {
            setFamilyMembers(famRes.data?.data || []);
          }
        } catch {
          if (isMounted) setFamilyMembers([]);
        } finally {
          if (isMounted) setLoadingMembers(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Could not load booking details.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [slugKey, initialMode, api]);

  // Handle quick add family member directly inside booking flow
  const handleQuickAddMember = async (e) => {
    e.preventDefault();
    if (!addName.trim() || !addRelation.trim() || !addAge) {
      setAddMemberError('Please enter name, relation, and age.');
      return;
    }

    try {
      setAddMemberSubmitting(true);
      setAddMemberError(null);
      const res = await api.post('/api/family-members', {
        name: addName.trim(),
        relation: addRelation.trim(),
        age: parseInt(addAge, 10),
        gender: addGender,
      });

      const newMember = res.data?.data;
      if (res.data?.accountType && user?.accountType !== res.data.accountType) {
        updateUser({ accountType: res.data.accountType });
      }

      setFamilyMembers((prev) => [newMember, ...prev]);
      setSelectedPatient(newMember._id);
      setAddName('');
      setAddRelation('');
      setAddAge('');
      setAddGender('other');
      setIsAddMemberModalOpen(false);
    } catch (err) {
      setAddMemberError(err.response?.data?.error?.message || err.message || 'Failed to add member.');
    } finally {
      setAddMemberSubmitting(false);
    }
  };

  /**
   * The patient's address book.
   *
   * Two things depend on it, and they used to disagree. The booking is
   * collected from an address the server resolves out of this list, while the
   * lab search ran from the city centre — so the distances on screen were
   * measured from somewhere the patient had never been, and editing their
   * address changed nothing they could see.
   */
  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => (await api.get('/api/addresses')).data?.data ?? [],
  });
  const addresses = React.useMemo(() => addressesQuery.data ?? [], [addressesQuery.data]);

  /**
   * Which address this booking collects from.
   *
   * Same precedence the mobile app uses (`BookingScreen.jsx`): an explicit
   * choice, else the one marked default, else the first. Kept identical on
   * purpose — two rules for "where does the rider go" is one more than anyone
   * can hold in their head.
   */
  const effectiveAddress =
    addresses.find((a) => a._id === selectedAddressId) ??
    addresses.find((a) => a.isDefault) ??
    addresses[0] ??
    null;

  /**
   * Where to search for labs.
   *
   * The patient's own coordinates when we have them, the configured city
   * centre only when the address book is empty. `Number.isFinite` rather than
   * a truthiness check because a legitimate 0 is a valid coordinate, and
   * because an address saved before lat/lng were required can carry undefined.
   */
  const searchLat = Number.isFinite(effectiveAddress?.lat) ? effectiveAddress.lat : DEFAULT_LAT;
  const searchLng = Number.isFinite(effectiveAddress?.lng) ? effectiveAddress.lng : DEFAULT_LNG;

  const labsQuery = useQuery({
    queryKey: ['labs', 'nearby', test?.slug ?? null, searchLat, searchLng],
    queryFn: () => fetchNearbyLabs({ lat: searchLat, lng: searchLng, testId: test.slug }),
    enabled: Boolean(test?.slug) && Number.isFinite(searchLat) && Number.isFinite(searchLng),
  });
  // Memoised on the response object so the identity is stable between renders;
  // a fresh `[]` each time would re-run the selection effect below forever.
  const labs = React.useMemo(() => labsQuery.data?.labs ?? [], [labsQuery.data]);

  /**
   * Keep the chosen lab valid.
   *
   * Moving the address re-runs the search, and the previously selected centre
   * may not serve the new one. Holding a stale id would price and book a lab
   * that is no longer on screen.
   */
  useEffect(() => {
    if (labs.length === 0) {
      setSelectedLabId('');
      return;
    }
    if (!labs.some((l) => l.id === selectedLabId)) {
      setSelectedLabId(labs[0].id);
    }
  }, [labs, selectedLabId]);

  // Selected Lab object & server-side calculated pricing
  const selectedLab = labs.find((l) => l.id === selectedLabId) || labs[0];

  /**
   * The price, from the server.
   *
   * This page used to compute it: sum the base prices, apply the lab
   * multiplier, round. That was a hand-maintained copy of the backend's
   * `calculateBookingPrice`, and the per-line figures below were rounded
   * individually — so the column did not necessarily add up to the total it
   * sat above. Both are now one call to /api/cart/quote, which prices the
   * basket with the function the booking charges with.
   *
   * Keyed on the basket AND the chosen lab, because switching centres changes
   * the price and a stale total is the one thing this must never show.
   */
  const quoteQuery = useQuery({
    queryKey: [
      'cart',
      'quote',
      tests.map((item) => item.slug).join(','),
      selectedLab?.id ?? null,
    ],
    queryFn: () =>
      fetchCartQuote({
        items: tests.map((item) => item.slug),
        labCenterId: selectedLab?.id ?? null,
      }),
    enabled: tests.length > 0,
    staleTime: 0,
  });

  const quote = quoteQuery.data ?? null;
  // Null until the server answers. Rendering falls back to '—' rather than to
  // a number this page worked out, which is the whole point of the change.
  const computedPrice = typeof quote?.total === 'number' ? quote.total : null;
  const priceLabel =
    computedPrice === null ? '—' : `₹${computedPrice.toLocaleString('en-IN')}`;

  // Dynamic Razorpay script loader
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Handle Booking submission & Razorpay Checkout
  const handleConfirmBooking = async () => {
    if (isSubmitting) return;

    /**
     * Say why nothing happened.
     *
     * These were a bare `return`, so a patient outside the service radius
     * clicked "Pay & confirm" and got no spinner, no message, nothing at all
     * — the button simply looked broken. `selectedLab` resolves to `labs[0]`,
     * so an empty lab list (every lab further than the search radius) lands
     * here, which is precisely the case a real user in an unserved town hits.
     */
    if (!test) {
      setSubmitError('We could not load this test. Please go back and pick it again.');
      return;
    }
    if (!selectedLab) {
      setSubmitError(
        'No partner lab serves your saved address yet, so this booking cannot be placed. ' +
          'Try a different address from your profile, or contact us if you think this is wrong.'
      );
      return;
    }
    /**
     * Home collection needs somewhere to collect from.
     *
     * The server rejects this with a 400 the patient never sees, so it is
     * caught here where there is somewhere to say it. This page did not send
     * `addressId` at all, which made every home-collection booking on the web
     * fail validation before a booking existed — so Razorpay never opened and
     * the button looked dead.
     */
    if (mode === 'home' && !effectiveAddress?._id) {
      setSubmitError(
        'Add a collection address on your profile before booking a home visit — ' +
          'we need to know where to send the phlebotomist.'
      );
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);

    try {
      // Build slotDateTime
      const targetDate = new Date(days[selectedDayIndex].date);
      const [hourMinute, ampm] = selectedTimeSlot.split(' ');
      const [hours, minutes] = hourMinute.split(':').map(Number);
      let adjustedHours = hours;
      if (ampm === 'PM' && hours < 12) adjustedHours += 12;
      if (ampm === 'AM' && hours === 12) adjustedHours = 0;
      targetDate.setHours(adjustedHours, minutes, 0, 0);

      // Structure referralSource
      let referralSource = { type: 'none' };
      if (referralType === 'partner' && selectedDoctorId) {
        referralSource = {
          type: 'partner',
          partnerDoctorId: selectedDoctorId,
        };
      } else if (referralType === 'external' && externalDoctorText.trim()) {
        referralSource = {
          type: 'external',
          externalText: externalDoctorText.trim(),
        };
      }

      // Generate client UUID for idempotency
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Split by kind so a checkup is recorded AS a checkup. Sending
      // everything as testIds priced correctly but lost the package label on
      // the rider job card, the lab queue and the doctor's view.
      const isPackageItem = (item) => item.category === 'package' || item.category === 'plan';

      const payload = {
        testIds: tests.filter((item) => !isPackageItem(item)).map((item) => item.id || item._id),
        packageIds: tests.filter(isPackageItem).map((item) => item.id || item._id),
        labCenterId: selectedLab.id,
        mode,
        slotDateTime: targetDate.toISOString(),
        paymentMode,
        referralSource,
        familyMemberId: selectedPatient !== 'self' ? selectedPatient : null,
        // Only for home collection — the server requires it there and ignores
        // it for a lab visit, where the patient travels to the centre.
        ...(mode === 'home' ? { addressId: effectiveAddress?._id } : {}),
      };

      // 1. Call POST /api/bookings with Idempotency-Key header
      const { data } = await api.post('/api/bookings', payload, {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      });

      const newBooking = data.data || data;

      // Emptied as soon as the booking EXISTS, not when payment lands. The
      // booking is already created at this point; leaving the basket full is
      // how someone books the same panel twice.
      if (fromCart) clearCart();

      // 2. If UPI, open Razorpay Checkout modal
      if (paymentMode === 'upi') {
        try {
          const scriptLoaded = await loadRazorpayScript();
          const orderRes = await api.post('/api/payments/create-order', {
            bookingId: newBooking._id || newBooking.id,
          });

          const orderData = orderRes.data.data;

          if (scriptLoaded && window.Razorpay) {
            const rzp = new window.Razorpay({
              key: orderData.keyId,
              amount: orderData.amount,
              currency: orderData.currency || 'INR',
              name: 'PathCare Diagnostics',
              description:
                tests.length > 1 ? `${test.name} + ${tests.length - 1} more` : test.name,
              order_id: orderData.orderId,
              prefill: {
                name: user?.name,
                contact: user?.phone,
              },
              theme: {
                color: '#3E63DD',
              },
              handler: (response) => {
                // Optimistic success in UI; official DB payment status updates when webhook lands
                setConfirmedBooking({
                  ...newBooking,
                  optimisticSuccess: true,
                  paymentStatus: 'paid',
                  gatewayPaymentId: response.razorpay_payment_id,
                });
              },
              modal: {
                ondismiss: () => {
                  // If modal closed, booking was created; webhook completes if money moved
                  setConfirmedBooking(newBooking);
                },
              },
            });

            rzp.open();
            return;
          }
        } catch (rzpErr) {
          console.warn('Razorpay checkout initialization notice:', rzpErr);
        }
      }

      // Default or Cash flow completion
      setConfirmedBooking(newBooking);
    } catch (err) {
      setSubmitError(
        err.response?.data?.error?.message ||
          err.message ||
          'Failed to complete your booking. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[840px] w-full mx-auto px-5 sm:px-7 py-6 sm:py-9 pb-24 md:pb-12">
        {/* Back Link */}
        <button
          type="button"
          onClick={() => (test ? navigate(`/tests/${test.slug}`) : navigate('/tests'))}
          className="text-blue600 font-bold text-sm cursor-pointer hover:underline flex items-center gap-1.5 mb-5 select-none"
          data-testid="back-btn"
        >
          <span>←</span>
          <span>Back</span>
        </button>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64 rounded-pill" />
            <Skeleton className="h-5 w-48 mb-6" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : error || !test ? (
          <EmptyState
            icon="alert"
            title="Unable to load booking"
            body={error || 'Test not found.'}
            ctaText="Browse all tests"
            onCtaClick={() => navigate('/tests')}
          />
        ) : confirmedBooking ? (
          /* ================= SUCCESS STATE ================= */
          <div className="space-y-6 animate-fadeIn" data-testid="booking-success-view">
            <Card className="p-8 sm:p-10 border border-border text-center">
              <div className="w-16 h-16 bg-green/10 text-green rounded-full mx-auto flex items-center justify-center text-3xl mb-4 select-none">
                ✓
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight mb-2">
                Booking Confirmed!
              </h1>
              <p className="text-muted text-sm sm:text-base max-w-md mx-auto mb-6">
                Your order has been recorded. Our operations team is coordinating with the laboratory.
              </p>

              {/* Booking Reference Box */}
              <div className="bg-blue50 border border-blue100 rounded-lg p-4 sm:p-5 max-w-md mx-auto text-left mb-6 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted uppercase font-bold">Booking ID</span>
                  <span className="font-mono font-extrabold text-blue700">
                    {confirmedBooking._id || confirmedBooking.id}
                  </span>
                </div>
                <div className="flex justify-between items-start text-xs gap-4">
                  <span className="text-muted shrink-0">
                    {tests.length > 1 ? 'Tests' : 'Test'}
                  </span>
                  <span className="font-bold text-ink text-right">
                    {tests.map((item) => item.name).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">Laboratory</span>
                  <span className="font-bold text-ink">{selectedLab?.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">Mode</span>
                  <span className="font-bold text-ink capitalize">
                    {confirmedBooking.mode === 'home' ? 'Home Collection' : 'Lab Visit'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">Slot Time</span>
                  <span className="font-bold text-ink">
                    {new Date(confirmedBooking.slotDateTime).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    · {selectedTimeSlot}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">Amount</span>
                  <span className="font-extrabold text-blue600 text-sm">
                    ₹{confirmedBooking.amount}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">Payment</span>
                  <span className="font-bold text-ink capitalize">
                    {confirmedBooking.paymentMode?.toUpperCase()} ({confirmedBooking.paymentStatus})
                  </span>
                </div>
              </div>

              {/* Notice for lab visit autoCancel */}
              {confirmedBooking.mode === 'visit' && (
                <div className="p-3.5 rounded-md bg-amberBg text-amberDark text-xs max-w-md mx-auto mb-6 text-left">
                  <span className="font-bold">Lab Visit Notice: </span>
                  Please arrive within 8 hours of your scheduled slot. Bookings not confirmed by the
                  lab centre within 8 hours are automatically cancelled.
                </div>
              )}

              {/* Notice for optimistic UPI payment */}
              {confirmedBooking.optimisticSuccess && (
                <div className="p-3.5 rounded-md bg-blue50 border border-blue100 text-blue700 text-xs max-w-md mx-auto mb-6 text-left">
                  <span className="font-bold">Payment Verified: </span>
                  Payment submitted via Razorpay. Your diagnostic records will reflect the paid status as soon as the bank confirmation webhook lands.
                </div>
              )}

              {/* Notice for cash booking */}
              {confirmedBooking.paymentMode === 'cash' && (
                <div className="p-3.5 rounded-md bg-amberBg text-amberDark text-xs max-w-md mx-auto mb-6 text-left">
                  <span className="font-bold">Cash Payment: </span>
                  Your booking is registered with payment pending until collection.
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                <Button variant="primary" onClick={() => navigate('/')} className="flex-1">
                  Go to Dashboard
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/tests')}
                  className="flex-1"
                >
                  Book another test
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          /* ================= 5-STEP BOOKING FLOW ================= */
          <div>
            <h1 className="text-[26px] sm:text-[30px] font-extrabold text-ink tracking-tight mb-1.5">
              Confirm your booking
            </h1>
            <p className="text-muted text-sm sm:text-base mb-6 flex items-center gap-2">
              <span data-testid="booking-items-summary">
                {tests.length > 1 ? `${tests.length} tests` : test.name}
              </span>
              <span>·</span>
              <span className="font-semibold text-blue600">
                {mode === 'home' ? 'Home collection' : 'Lab visit'}
              </span>
            </p>

            {submitError && (
              <div className="mb-6 p-4 rounded-lg bg-redBg border border-red text-redDark text-sm flex items-center gap-2.5">
                <Icon name="alert" size={16} className="inline-block shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* STEP 1: Who is this test for? */}
            <Card className="p-5 sm:p-6 mb-4 border border-border">
              <p className="font-extrabold text-[15px] text-ink mb-3.5">
                1 · Who is this test for?
              </p>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {/* Myself (you) */}
                <button
                  type="button"
                  onClick={() => setSelectedPatient('self')}
                  className={`px-3.5 py-1.5 rounded-pill text-xs font-bold transition cursor-pointer ${
                    selectedPatient === 'self'
                      ? 'bg-blue600 text-white'
                      : 'bg-chipGreyBg text-ink hover:bg-border'
                  }`}
                  data-testid="patient-self-chip"
                >
                  {user?.name || 'Myself'} (you)
                </button>

                {/* Real Family Members */}
                {familyMembers.map((m) => (
                  <button
                    key={m._id}
                    type="button"
                    onClick={() => setSelectedPatient(m._id)}
                    className={`px-3.5 py-1.5 rounded-pill text-xs font-bold transition cursor-pointer ${
                      selectedPatient === m._id
                        ? 'bg-blue600 text-white'
                        : 'bg-chipGreyBg text-ink hover:bg-border'
                    }`}
                    data-testid={`patient-member-${m._id}`}
                  >
                    {m.name} ({m.relation})
                  </button>
                ))}

                {/* + Add member button */}
                <button
                  type="button"
                  onClick={() => setIsAddMemberModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-pill text-xs font-bold bg-chipGreyBg text-blue600 hover:bg-blue50 border border-dashed border-blue300 transition cursor-pointer"
                  data-testid="patient-add-member-chip"
                >
                  + Add member
                </button>
              </div>

              {selectedPatient !== 'self' && (
                <p className="text-[12.5px] text-muted mt-2">
                  Booking on behalf of a family member — their name and age are already on file.
                </p>
              )}
            </Card>

            {/* STEP 2: Choose a lab */}
            <Card className="p-5 sm:p-6 mb-4 border border-border">
              <p className="font-extrabold text-[15px] text-ink mb-3.5">2 · Choose a lab</p>

              {/* The address sits here, above the list, because it is what the
                  distances below are measured from. Putting it on its own step
                  hid that relationship: changing it silently reorders the labs,
                  and for home collection it is also where the rider is sent. */}
              {addresses.length > 0 ? (
                <div className="mb-3.5 rounded-lg border border-border bg-chipGreyBg px-3.5 py-3">
                  <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
                    {mode === 'home' ? 'Collecting from' : 'Distances from'}
                  </p>
                  {addresses.length === 1 ? (
                    <p className="text-sm text-ink mt-1" data-testid="booking-address-line">
                      {effectiveAddress?.label ? `${effectiveAddress.label} · ` : ''}
                      {effectiveAddress?.line}
                    </p>
                  ) : (
                    <select
                      className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"
                      value={effectiveAddress?._id ?? ''}
                      onChange={(e) => setSelectedAddressId(e.target.value)}
                      data-testid="booking-address-select"
                    >
                      {addresses.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.label ? `${a.label} · ` : ''}
                          {a.line}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div
                  className="mb-3.5 rounded-lg border border-amber bg-amberBg px-4 py-3.5"
                  data-testid="booking-no-address"
                >
                  <p className="text-sm font-bold text-ink">No saved address</p>
                  <p className="mt-1 text-xs text-muted">
                    {mode === 'home'
                      ? 'Add one on your profile so we know where to send the phlebotomist. '
                      : 'Add one on your profile to see labs nearest you. '}
                    Until then we are showing labs around {CITY}.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/profile')}
                    className="mt-2 text-xs font-bold text-blue600 hover:underline cursor-pointer"
                    data-testid="booking-add-address-link"
                  >
                    Add an address
                  </button>
                </div>
              )}

              {/* An empty list used to render as an empty box, which reads as
                  "still loading" rather than "there is nothing here". Without
                  a lab there is no booking to place, so say so where the user
                  is looking instead of letting them reach the pay button and
                  find it inert. */}
              {labsQuery.isPending ? (
                <Skeleton className="h-16 w-full rounded-lg" />
              ) : labs.length === 0 ? (
                <div
                  data-testid="no-labs-in-range"
                  className="rounded-lg border border-amber bg-amberBg px-4 py-3.5"
                >
                  <p className="text-sm font-bold text-ink">No partner lab covers your address yet</p>
                  <p className="mt-1 text-xs text-muted">
                    We are in {CITY} and expanding. Change the service address on your profile if you
                    are nearer one of our labs, or check back soon.
                  </p>
                </div>
              ) : null}

              <div className="space-y-2.5">
                {labs.map((lab) => {
                  const labPrice = Math.round(test.basePrice * (lab.priceMultiplier || 1.0));
                  const isSelected = selectedLabId === lab.id;

                  return (
                    <div
                      key={lab.id}
                      onClick={() => setSelectedLabId(lab.id)}
                      className={`p-3.5 rounded-lg border transition cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-blue600 bg-blue50'
                          : 'border-border bg-white hover:border-muted2'
                      }`}
                      data-testid={`select-lab-${lab.id}`}
                    >
                      <div>
                        <p className="font-bold text-sm text-ink flex items-center gap-2">
                          <span>{lab.name}</span>
                          {lab.accreditation?.nabl && (
                            <span className="text-[10.5px] font-extrabold px-1.5 py-0.5 rounded-pill bg-blue100 text-blue700">
                              NABL
                            </span>
                          )}
                        </p>
                        <p className="text-muted text-xs mt-0.5">
                          {lab.area} · {lab.distanceKm} km · {lab.turnaroundHrs} hr report
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-extrabold text-blue600 text-base">₹{labPrice}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* STEP 3: Pick a slot */}
            <Card className="p-5 sm:p-6 mb-4 border border-border">
              <p className="font-extrabold text-[15px] text-ink mb-3.5">
                3 · Pick a {mode === 'home' ? 'collection' : 'visit'} slot
              </p>

              {/* Day Selector */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-3.5 select-none">
                {days.map((d, index) => {
                  const isDaySelected = selectedDayIndex === index;
                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedDayIndex(index)}
                      className={`min-w-[76px] p-2.5 rounded-lg border text-center cursor-pointer transition flex-1 ${
                        isDaySelected
                          ? 'border-blue600 bg-blue50 text-blue700'
                          : 'border-border bg-white text-ink hover:bg-bg'
                      }`}
                    >
                      <p className="text-[11px] font-bold uppercase opacity-80">{d.label}</p>
                      <p className="text-sm font-extrabold mt-0.5">{d.sub}</p>
                    </div>
                  );
                })}
              </div>

              {/* Time Slot Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {timeSlots.map((slot) => {
                  const isSlotSelected = selectedTimeSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTimeSlot(slot)}
                      className={`py-2 px-3 rounded-md text-xs font-bold transition cursor-pointer border ${
                        isSlotSelected
                          ? 'border-blue600 bg-blue600 text-white'
                          : 'border-border bg-white text-ink hover:bg-bg'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* STEP 4: Were you referred by a doctor? */}
            <Card className="p-5 sm:p-6 mb-4 border border-border">
              <p className="font-extrabold text-[15px] text-ink mb-1">
                4 · Were you referred by a doctor?
              </p>
              <p className="text-muted text-xs mb-3.5">
                Optional. Helps us deliver your report directly to your doctor.
              </p>

              <div className="space-y-2.5">
                {/* Option 1: None */}
                <label className="flex items-center gap-2.5 text-xs text-ink font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="referral"
                    checked={referralType === 'none'}
                    onChange={() => setReferralType('none')}
                    className="accent-blue600"
                  />
                  <span>No referring doctor / self-booked</span>
                </label>

                {/* Option 2: Partner Doctor */}
                <label className="flex items-center gap-2.5 text-xs text-ink font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="referral"
                    checked={referralType === 'partner'}
                    onChange={() => setReferralType('partner')}
                    className="accent-blue600"
                  />
                  <span>Partner doctor</span>
                </label>

                {referralType === 'partner' && (
                  <div className="pl-6 pt-1">
                    <select
                      value={selectedDoctorId}
                      onChange={(e) => setSelectedDoctorId(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-border bg-white text-xs text-ink outline-none focus:border-blue600"
                    >
                      <option value="">Select a partner doctor...</option>
                      {partnerDoctors.map((doc) => (
                        <option key={doc._id} value={doc._id}>
                          {doc.name} — {doc.specialization} ({doc.clinicName || CITY})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Option 3: External Doctor */}
                <label className="flex items-center gap-2.5 text-xs text-ink font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="referral"
                    checked={referralType === 'external'}
                    onChange={() => setReferralType('external')}
                    className="accent-blue600"
                  />
                  <span>Another doctor or hospital (unlisted)</span>
                </label>

                {referralType === 'external' && (
                  <div className="pl-6 pt-1">
                    <input
                      type="text"
                      placeholder="Doctor or clinic/hospital name"
                      value={externalDoctorText}
                      onChange={(e) => setExternalDoctorText(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-border bg-white text-xs text-ink outline-none focus:border-blue600"
                    />
                  </div>
                )}
              </div>

              {/* NMC Compliance Text verbatim per DESIGN_SPEC §5.5 */}
              <p className="text-[11.5px] text-muted mt-4 pt-3 border-t border-border leading-relaxed">
                Reports are delivered directly to your referring doctor at no extra charge.
                PathCare does not pay referral commissions.
              </p>
            </Card>

            {/* STEP 5: Payment Mode & Price Breakdown */}
            <Card className="p-5 sm:p-6 mb-6 border border-border">
              <p className="font-extrabold text-[15px] text-ink mb-3.5">5 · Payment</p>

              <div className="space-y-2.5 mb-5">
                {/* UPI */}
                <div
                  onClick={() => setPaymentMode('upi')}
                  className={`p-3.5 rounded-lg border transition cursor-pointer ${
                    paymentMode === 'upi'
                      ? 'border-blue600 bg-blue50'
                      : 'border-border bg-white hover:border-muted2'
                  }`}
                  data-testid="pay-upi-card"
                >
                  <p className="font-bold text-sm text-ink flex items-center gap-2">
                    <Icon name="smartphone" size={16} className="inline-block shrink-0" />
                    <span>Pay online (UPI)</span>
                  </p>
                  <p className="text-muted text-xs mt-0.5">
                    Instant confirmation. Refundable minus ₹20 if you cancel.
                  </p>
                </div>

                {/* Cash */}
                <div
                  onClick={() => setPaymentMode('cash')}
                  className={`p-3.5 rounded-lg border transition cursor-pointer ${
                    paymentMode === 'cash'
                      ? 'border-blue600 bg-blue50'
                      : 'border-border bg-white hover:border-muted2'
                  }`}
                  data-testid="pay-cash-card"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm text-ink flex items-center gap-2">
                      <Icon name="rupee" size={16} className="inline-block shrink-0" />
                      <span>{mode === 'home' ? 'Cash on collection' : 'Pay at the lab'}</span>
                    </p>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-pill bg-amberBg text-amberDark">
                      payment pending until collection
                    </span>
                  </div>
                  <p className="text-muted text-xs mt-1">
                    Your booking stays payment-pending until collection is confirmed by{' '}
                    {mode === 'home' ? 'the phlebotomist' : 'the lab'}. Free to cancel.
                  </p>
                </div>
              </div>

              {/* Server Calculated Summary Box */}
              <div className="p-4 rounded-lg bg-blue50 border border-blue100 mb-4 space-y-2">
                {/* One line per test. With a basket, a single lump sum is not
                    something a patient can check against what they added. */}
                {/* Catalogue prices, one line each. The lab's effect is the
                    single row below, because the server rounds ONCE over the
                    whole basket — multiplying each line and rounding it
                    separately produces a column that does not add up to the
                    total underneath it. */}
                {(quote?.lines ?? tests).map((item) => (
                  <div
                    key={item.slug || item.id}
                    className="flex justify-between gap-4 text-sm"
                    data-testid={`summary-line-${item.slug}`}
                  >
                    <span className="text-muted">{item.name}</span>
                    <span className="font-bold text-ink">
                      ₹{Number(item.basePrice).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}

                {/* Named for what it is. A bare lab name against "+₹450"
                    reads like a fee the centre charges; it is the same tests
                    priced differently there. Hidden entirely at zero, because
                    a "+₹0" row is noise. */}
                {quote?.lab && quote.labAdjustment !== 0 && (
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-muted">
                      {quote.labAdjustment > 0 ? 'Lab pricing' : 'Lab discount'} ·{' '}
                      {quote.lab.name}
                    </span>
                    <span className="font-bold text-ink" data-testid="booking-lab-adjustment">
                      {quote.labAdjustment > 0 ? '+' : '−'}₹
                      {Math.abs(quote.labAdjustment).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    {mode === 'home' ? 'Home collection' : 'Lab visit'}
                  </span>
                  <span className="font-bold text-green">Free</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-base font-extrabold text-ink">
                  <span>Total</span>
                  <span className="text-blue600" data-testid="booking-total">
                    {priceLabel}
                  </span>
                </div>

                {quoteQuery.isError && (
                  <p className="text-caption text-redDark" data-testid="booking-quote-error">
                    We could not price this booking just now. Please try again before paying.
                  </p>
                )}
              </div>

              {/* The same error also renders at the top of the flow, which on
                  a phone is several screens above this button — so a failure
                  here would still look like nothing happened. Repeat it where
                  the click was. */}
              {submitError && (
                <div
                  data-testid="confirm-error"
                  className="mb-3 flex items-start gap-2 rounded-lg border border-red bg-redBg p-3 text-xs text-redDark"
                >
                  <Icon name="alert" size={14} className="mt-0.5 inline-block shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Confirm Pill Button */}
              <Button
                variant="primary"
                className="w-full text-base py-3.5"
                onClick={handleConfirmBooking}
                disabled={isSubmitting}
                data-testid="confirm-booking-btn"
              >
                {isSubmitting
                  ? 'Confirming Booking...'
                  : paymentMode === 'cash'
                  ? 'Confirm booking'
                  : `Pay ${priceLabel} & confirm`}
              </Button>
            </Card>
          </div>
        )}

        {/* Quick Add Family Member Modal */}
        <Modal
          isOpen={isAddMemberModalOpen}
          onClose={() => setIsAddMemberModalOpen(false)}
          title="Add a family member"
        >
          <form onSubmit={handleQuickAddMember} className="space-y-4" data-testid="quick-add-member-form">
            {addMemberError && (
              <div className="p-3 bg-red/10 border border-red/30 rounded-xl text-red text-xs font-semibold">
                {addMemberError}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-ink block mb-1">Full name</label>
              <input
                type="text"
                placeholder="e.g. Sunita Sharma"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
                required
                data-testid="booking-member-name-input"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-ink block mb-1">Relation</label>
              <input
                type="text"
                placeholder="e.g. Mother, Father, Spouse, Child"
                value={addRelation}
                onChange={(e) => setAddRelation(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
                required
                data-testid="booking-member-relation-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-ink block mb-1">Age</label>
                <input
                  type="number"
                  placeholder="e.g. 58"
                  min="0"
                  max="125"
                  value={addAge}
                  onChange={(e) => setAddAge(e.target.value)}
                  className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100"
                  required
                  data-testid="booking-member-age-input"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">Gender</label>
                <select
                  value={addGender}
                  onChange={(e) => setAddGender(e.target.value)}
                  className="w-full border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue600 focus:ring-2 focus:ring-blue100 bg-white"
                  data-testid="booking-member-gender-select"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="default"
                className="w-full"
                disabled={addMemberSubmitting}
                data-testid="booking-submit-member-btn"
              >
                {addMemberSubmitting ? 'Adding...' : 'Add member'}
              </Button>
            </div>
          </form>
        </Modal>
      </main>

      <WhatsAppFab />
    </div>
  );
}

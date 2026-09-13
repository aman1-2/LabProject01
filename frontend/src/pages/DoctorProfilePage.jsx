import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar.jsx';
import Card from '../components/atoms/Card.jsx';
import Chip from '../components/atoms/Chip.jsx';
import Button from '../components/atoms/Button.jsx';
import Modal from '../components/atoms/Modal.jsx';
import EmptyState from '../components/atoms/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function getAvatarColor(name = '') {
  const colors = [
    '#2563EB', '#7C3AED', '#DB2777', '#EA580C',
    '#059669', '#0891B2', '#4F46E5', '#D97706'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name = '') {
  const parts = name.replace(/^Dr\.\s*/i, '').trim().split(/\s+/);
  if (!parts[0]) return 'DR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DEFAULT_SLOTS = [
  '10:00 AM',
  '11:30 AM',
  '04:00 PM',
  '05:30 PM',
  '06:30 PM',
  '07:00 PM',
];

export function DoctorProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, api } = useAuth();

  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookedDetails, setBookedDetails] = useState(null);
  const [bookingError, setBookingError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadDoctor() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/doctors/${id}`);
        if (isMounted && res.data?.success) {
          setDoctor(res.data.data);
        }
      } catch (err) {
        if (isMounted) {
          setError('Doctor profile not found.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadDoctor();
    return () => {
      isMounted = false;
    };
  }, [id, api]);

  const handleBookAppointment = async () => {
    setBookingError('');
    if (!isAuthenticated) {
      navigate('/auth', { state: { from: `/doctors/${id}` } });
      return;
    }

    if (!selectedSlot) {
      setBookingError('Please select a time slot first.');
      return;
    }

    setBookingLoading(true);
    try {
      // Parse slot string (e.g. "10:00 AM", "05:30 PM") into valid Date
      const [timeStr, modifier] = selectedSlot.split(' ');
      let [hours, minutes] = (timeStr || '10:00').split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;

      const slotDate = new Date();
      slotDate.setHours(hours, minutes || 0, 0, 0);
      if (slotDate.getTime() <= Date.now()) {
        slotDate.setDate(slotDate.getDate() + 1);
      }

      const res = await api.post('/api/appointments', {
        doctorId: doctor._id,
        slotDateTime: slotDate.toISOString(),
        slotLabel: selectedSlot,
        notes: 'Booked via PathCare web portal',
      });

      if (res.data?.success) {
        setBookedDetails({
          slot: selectedSlot,
          doctorName: doctor.name,
          clinic: doctor.clinicAddress || doctor.clinicName,
          fee: doctor.consultationFee,
        });
        setBookingSuccess(true);
      }
    } catch (err) {
      setBookingError(
        err.response?.data?.message || 'Failed to book appointment. Please try again.'
      );
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-10 animate-pulse">
          <div className="h-6 w-32 bg-border rounded mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr] gap-8">
            <div className="h-96 bg-white rounded-xl border border-border" />
            <div className="h-80 bg-white rounded-xl border border-border" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !doctor) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-10">
          <EmptyState
            icon="stethoscope"
            title="Doctor Not Found"
            body="The doctor profile you are looking for does not exist or is inactive."
            ctaText="Back to Doctors"
            onCtaClick={() => navigate('/doctors')}
          />
        </main>
      </div>
    );
  }

  const bgCol = getAvatarColor(doctor.name);
  const initials = getInitials(doctor.name);
  const isFeatured = doctor.isFeatured || doctor.tier === 'Gold';
  const discountPct = doctor.walkInFee > doctor.consultationFee
    ? Math.round((1 - doctor.consultationFee / doctor.walkInFee) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-8">
        {/* Back Link */}
        <Link
          to="/doctors"
          className="inline-flex items-center gap-1.5 text-blue600 font-bold text-bodySmall hover:text-blue700 transition mb-6"
        >
          ← All doctors
        </Link>

        {/* 2-Column Hero Layout matching prototype line 733 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr] gap-9 items-start">
          {/* Left Column: Doctor Profile Details */}
          <div>
            {/* Header: Avatar, Name, Qualification, Badges */}
            <div className="flex items-center gap-5 mb-6">
              <div
                className="w-[72px] h-[72px] rounded-pill text-white flex items-center justify-center font-extrabold text-[23px] flex-shrink-0 shadow-sm"
                style={{ backgroundColor: bgCol }}
              >
                {initials}
              </div>
              <div>
                <h1 className="text-[25px] font-extrabold text-ink mb-1">
                  {doctor.name}
                </h1>
                <p className="text-body text-muted mb-2 font-medium">
                  {doctor.qualification || 'MBBS'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip variant="blue">{doctor.specialization}</Chip>
                  {doctor.experienceYears && (
                    <Chip variant="grey">{doctor.experienceYears} yrs</Chip>
                  )}
                  {isFeatured && (
                    <Chip variant="amber" data-testid="featured-partner-badge">
                      Featured partner
                    </Chip>
                  )}
                </div>
              </div>
            </div>

            {/* Clinic Details Card matching prototype line 737 */}
            <Card className="p-6 mb-5">
              <h2 className="font-extrabold text-cardTitle text-ink mb-4">
                Clinic Information
              </h2>
              <div className="space-y-3 text-bodySmall">
                <div className="flex justify-between border-b border-border pb-2.5">
                  <span className="text-muted font-medium">Clinic Name</span>
                  <span className="text-ink font-bold">{doctor.clinicName}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2.5">
                  <span className="text-muted font-medium">Address</span>
                  <span className="text-ink font-bold text-right max-w-[280px]">
                    {doctor.clinicAddress || doctor.clinicName}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border pb-2.5">
                  <span className="text-muted font-medium">Consultation hours</span>
                  <span className="text-ink font-bold">
                    {doctor.consultationHours || 'Mon–Sat, 10:00 AM – 8:00 PM'}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted font-medium">Speciality</span>
                  <span className="text-ink font-bold">{doctor.specialization}</span>
                </div>
              </div>
            </Card>

            {/* About Card matching prototype line 739 */}
            <Card className="p-6">
              <h2 className="font-extrabold text-cardTitle text-ink mb-3">About</h2>
              <p className="text-body text-muted leading-relaxed">
                {doctor.about ||
                  `${doctor.name} is a specialist in ${doctor.specialization.toLowerCase()} with ${doctor.experienceYears || 'many'} years of clinical experience, practising at ${doctor.clinicName}. Verified PathCare partner — appointments booked through PathCare are confirmed directly with the clinic.`}
              </p>
            </Card>
          </div>

          {/* Right Column: Sticky Booking Card matching prototype lines 741-749 */}
          <div className="lg:sticky lg:top-[90px]">
            <Card className="p-6 shadow-card" data-testid="appointment-booking-box">
              <h2 className="font-extrabold text-[17px] text-ink mb-2">
                Book an appointment
              </h2>

              {/* Price Row */}
              <div className="flex items-baseline gap-3 my-3">
                <span className="text-[28px] font-extrabold text-blue600">
                  ₹{doctor.consultationFee}
                </span>
                {doctor.walkInFee > doctor.consultationFee && (
                  <span className="line-through text-muted2 text-base font-semibold">
                    ₹{doctor.walkInFee}
                  </span>
                )}
              </div>

              {discountPct > 0 && (
                <p className="text-green font-bold text-caption mb-4">
                  {discountPct}% lower than the walk-in fee
                </p>
              )}

              {/* Strict Regulatory Notice matching prototype line 745 */}
              <div className="p-3.5 bg-blue50 rounded-xl mb-5">
                <p className="text-caption text-blue700 leading-relaxed font-medium">
                  <span className="font-bold">You pay the doctor directly at the clinic.</span>{' '}
                  PathCare charges no booking fee and takes no share of the consultation.
                </p>
              </div>

              {bookingError && (
                <div className="p-3 bg-redBg text-redDark rounded-lg text-caption font-semibold mb-4">
                  {bookingError}
                </div>
              )}

              {/* Slot Picker */}
              <p className="font-bold text-caption text-ink mb-3">Available today</p>
              <div className="grid grid-cols-2 gap-2.5 mb-6" data-testid="slot-picker">
                {DEFAULT_SLOTS.map((slot) => {
                  const isSelected = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-3 rounded-lg border text-center font-bold text-caption transition cursor-pointer select-none ${
                        isSelected
                          ? 'bg-blue600 border-blue600 text-white shadow-sm'
                          : 'bg-white border-border text-ink hover:border-blue600'
                      }`}
                      data-testid={`slot-${slot}`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>

              {/* CTA Button */}
              <Button
                variant="primary"
                size="large"
                className="w-full"
                onClick={handleBookAppointment}
                loading={bookingLoading}
                disabled={bookingLoading}
                data-testid="confirm-appointment-button"
              >
                Confirm appointment
              </Button>
            </Card>
          </div>
        </div>
      </main>

      {/* Confirmation Modal matching prototype lines 757-760 */}
      <Modal
        isOpen={bookingSuccess}
        onClose={() => setBookingSuccess(false)}
        title="Appointment confirmed"
        maxWidth="max-w-[440px]"
      >
        <div className="text-center py-2" data-testid="appointment-success-modal">
          {/* Green Check Circle */}
          <div className="w-14 h-14 rounded-pill bg-greenBg flex items-center justify-center mx-auto mb-4 text-green">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 6L9 17l-5-5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <p className="text-body text-muted leading-relaxed mb-4">
            <span className="font-extrabold text-ink">{bookedDetails?.doctorName}</span>
            <br />
            Today at {bookedDetails?.slot}
            <br />
            <span className="text-caption">{bookedDetails?.clinic}</span>
          </p>

          {/* Direct Payment Reminder Box */}
          <div className="p-3.5 bg-blue50 rounded-xl mb-6 text-left">
            <p className="text-caption text-blue700 leading-relaxed">
              Pay <span className="font-bold">₹{bookedDetails?.fee}</span> directly at the clinic. Carry your PathCare report if you have one.
            </p>
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              setBookingSuccess(false);
              navigate('/doctors');
            }}
          >
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default DoctorProfilePage;

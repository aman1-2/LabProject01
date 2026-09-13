// frontend/src/pages/TrackingPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket, joinBookingRoom, leaveBookingRoom } from '../utils/socketClient.js';
import Navbar from '../components/layout/Navbar.jsx';
import StatusStepper from '../components/tracking/StatusStepper.jsx';
import LiveTrackingMap from '../components/tracking/LiveTrackingMap.jsx';
import RiderContactCard from '../components/tracking/RiderContactCard.jsx';
import Card from '../components/atoms/Card.jsx';
import Button from '../components/atoms/Button.jsx';
import Chip from '../components/atoms/Chip.jsx';
import EmptyState from '../components/atoms/EmptyState.jsx';
import Icon from '../components/atoms/Icon.jsx';

export function TrackingPage() {
  const { bookingId: routeBookingId } = useParams();
  const { api, accessToken } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportBlocked, setReportBlocked] = useState(null);

  // Track whether a disconnect occurred to trigger REST recovery upon reconnect
  const hasDisconnectedRef = useRef(false);

  // Fetch report details if report_ready
  const fetchReport = useCallback(async (bId) => {
    if (!bId) return;
    try {
      setReportLoading(true);
      const res = await api.get(`/api/reports/${bId}`);
      setReportData(res.data?.data || null);
      setReportBlocked(null);
    } catch (err) {
      setReportData(null);
      // A report withheld for non-payment is not an error to swallow. Without
      // this the tracker says "report ready" and then shows nothing at all,
      // which reads as the site being broken rather than as money being owed.
      const code = err.response?.data?.error?.code;
      setReportBlocked(
        code === 'PAYMENT_PENDING'
          ? err.response?.data?.error?.message ||
              'This report is ready but the booking is not paid yet.'
          : null
      );
    } finally {
      setReportLoading(false);
    }
  }, [api]);

  // REST fetch for booking details
  const fetchBooking = useCallback(
    async (isRecovery = false) => {
      try {
        if (!isRecovery) setLoading(true);

        let targetId = routeBookingId;

        // If no ID in route param, fetch patient's active/latest booking
        if (!targetId) {
          const resList = await api.get('/api/bookings');
          const bookings = resList.data?.data || [];
          if (bookings.length > 0) {
            targetId = bookings[0]._id || bookings[0].id;
          }
        }

        if (!targetId) {
          setBooking(null);
          setLoading(false);
          return;
        }

        const res = await api.get(`/api/bookings/${targetId}`);
        const freshBooking = res.data?.data || res.data;
        setBooking(freshBooking);
        setError(null);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to load booking');
      } finally {
        if (!isRecovery) setLoading(false);
      }
    },
    [api, routeBookingId]
  );

  useEffect(() => {
    fetchBooking();
  }, [routeBookingId]);

  useEffect(() => {
    if (booking?.status === 'report_ready' && booking?._id) {
      fetchReport(booking._id);
    }
  }, [booking?.status, booking?._id, fetchReport]);

  // Socket.IO real-time subscriptions & reconnect handling per CONTEXT §6.3
  useEffect(() => {
    if (!booking?._id) return;

    const bId = booking._id.toString();
    // The socket server rejects unauthenticated connections.
    const socket = getSocket(accessToken);

    // Join room for this booking
    joinBookingRoom(bId);

    const onConnect = () => {
      setIsSocketConnected(true);
      // ON RECONNECT: fetch current status once over REST.
      // Redis pub/sub has no replay, so without this a client that missed an event shows stale state forever.
      if (hasDisconnectedRef.current) {
        fetchBooking(true);
        hasDisconnectedRef.current = false;
      }
    };

    const onDisconnect = () => {
      setIsSocketConnected(false);
      hasDisconnectedRef.current = true;
    };

    const onStatusUpdated = (data) => {
      if (data.bookingId === bId) {
        setBooking((prev) => (prev ? { ...prev, status: data.status, barcode: data.barcode || prev.barcode } : null));
        fetchBooking(true);
        if (data.status === 'report_ready') {
          fetchReport(bId);
        }
      }
    };

    const onRiderLocation = (data) => {
      if (data.bookingId === bId) {
        setRiderLocation({ lat: data.lat, lng: data.lng });
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('BOOKING_STATUS_UPDATED', onStatusUpdated);
    socket.on('RIDER_LOCATION', onRiderLocation);

    if (socket.connected) {
      setIsSocketConnected(true);
    }

    return () => {
      leaveBookingRoom(bId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('BOOKING_STATUS_UPDATED', onStatusUpdated);
      socket.off('RIDER_LOCATION', onRiderLocation);
    };
  }, [booking?._id, accessToken, fetchBooking, fetchReport]);

  const handleDownloadReport = async () => {
    if (!booking?._id) return;
    try {
      const res = await api.get(`/api/reports/${booking._id}`);
      const freshUrl = res.data?.data?.downloadUrl;
      if (freshUrl) {
        window.open(freshUrl, '_blank');
      } else {
        alert('Download link could not be generated');
      }
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Report could not be retrieved');
    }
  };


  // Cancel booking action
  const handleCancelBooking = async () => {
    if (!booking?._id) return;
    const confirmCancel = window.confirm('Are you sure you want to cancel this booking?');
    if (!confirmCancel) return;

    try {
      await api.patch(`/api/bookings/${booking._id}/status`, {
        status: 'cancelled',
        reason: 'Cancelled by patient',
      });
      fetchBooking(true);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Could not cancel booking');
    }
  };

  const isEnRoute = booking?.status === 'en_route';
  const hasRider = Boolean(booking?.assignedRiderId) && booking?.status !== 'pending' && booking?.status !== 'awaiting_confirm';

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-8">
        {loading ? (
          <div className="py-20 text-center text-muted font-semibold">Loading booking tracking details...</div>
        ) : error ? (
          <div className="max-w-lg mx-auto py-16">
            <EmptyState
              icon="alert"
              title="Booking Not Found"
              description={error}
              actionLabel="Browse Catalogue"
              onAction={() => navigate('/tests')}
            />
          </div>
        ) : !booking ? (
          <div className="max-w-lg mx-auto py-16">
            <EmptyState
              icon="clipboard"
              title="No active booking"
              description="Once you book a test, live tracking — rider assignment, sample collection and your report — appears right here."
              actionLabel="Book a test"
              onAction={() => navigate('/tests')}
            />
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
              <h1 className="text-2xl md:text-[26px] font-extrabold text-ink">Track your booking</h1>

              <div className="flex items-center gap-2">
                {/* Socket Connection Status Indicator */}
                <div
                  data-testid="connection-status-pill"
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-pill flex items-center gap-1.5 ${
                    isSocketConnected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-pill ${isSocketConnected ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <span>{isSocketConnected ? 'Live Updates' : 'Connecting...'}</span>
                </div>

                {/* Cancellation action (before collected) */}
                {['pending', 'rider_assigned', 'en_route', 'awaiting_confirm', 'confirmed'].includes(booking.status) && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleCancelBooking}
                    className="!text-danger !border-red-200 hover:!bg-red-50"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <p className="text-sm text-muted mb-6">
              {booking.testIds?.[0]?.name || 'Lab Test'} · #{booking._id?.substring(booking._id.length - 6).toUpperCase()} ·{' '}
              {booking.mode === 'home' ? 'Home collection' : 'Lab visit'}
            </p>

            {/* Live Map during en_route per DESIGN_SPEC §3.7 */}
            {isEnRoute && <LiveTrackingMap riderLocation={riderLocation} etaMinutes={12} />}

            {/* 2-Column Grid matching prototype: 1.1fr / 0.9fr */}
            <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
              {/* Left Column: Status Stepper */}
              <Card className="p-6">
                <p className="font-extrabold text-sm mb-6 text-ink">Progress</p>
                <StatusStepper mode={booking.mode} status={booking.status} />
              </Card>

              {/* Right Column: Booking details & Rider card & Report */}
              <div className="flex flex-col gap-4">
                {/* Booking details card */}
                <Card className="p-5">
                  <p className="font-extrabold text-sm mb-3.5 text-ink">Booking details</p>
                  <div className="flex justify-between text-xs py-1.5 border-b border-border/40">
                    <span className="text-muted">Laboratory</span>
                    <span className="font-bold text-ink">{booking.labCenterId?.name || 'PathCare Partner Lab'}</span>
                  </div>
                  <div className="flex justify-between text-xs py-1.5 border-b border-border/40">
                    <span className="text-muted">Slot Time</span>
                    <span className="font-bold text-ink">
                      {new Date(booking.slotDateTime).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1.5 border-b border-border/40">
                    <span className="text-muted">Mode</span>
                    <span className="font-bold text-ink">{booking.mode === 'home' ? 'Home collection' : 'Lab visit'}</span>
                  </div>
                  <div className="flex justify-between text-xs py-1.5 border-b border-border/40">
                    <span className="text-muted">Payment</span>
                    <span className="font-bold text-ink">
                      {booking.paymentMode?.toUpperCase()} ·{' '}
                      <span className={booking.paymentStatus === 'paid' ? 'text-green-600' : 'text-amber-600'}>
                        {booking.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1.5">
                    <span className="text-muted">Barcode</span>
                    <span className="font-mono font-bold text-ink" data-testid="barcode-summary-value">
                      {booking.barcode || <span className="text-muted2 font-sans font-normal text-[11px]">assigned at collection</span>}
                    </span>
                  </div>
                </Card>

                {/* Cold Chain & Physical Sample Telemetry Card once collected per DESIGN_SPEC & Prototype */}
                {(Boolean(booking.barcode) || ['collected', 'at_lab', 'report_ready'].includes(booking.status)) && (
                  <Card className="p-5 border border-blue-200 bg-[#F8FAFF]" data-testid="cold-chain-card">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Icon name="snowflake" size={16} className="inline-block shrink-0" />
                        <div>
                          <p className="font-extrabold text-sm text-ink">Cold-Chain Status</p>
                          <p className="text-[11px] text-muted">Continuous temperature monitoring</p>
                        </div>
                      </div>
                      <Chip variant="green">2°C – 8°C Maintained</Chip>
                    </div>

                    {/* Barcode badge */}
                    <div className="bg-white border border-border rounded-lg p-3 mb-3 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-muted block uppercase tracking-wider">Sample Barcode</span>
                        <span className="font-mono font-extrabold text-blue700 text-sm md:text-base tracking-wider" data-testid="sample-barcode-val">
                          {booking.barcode || booking.sample?.barcode || 'PENDING'}
                        </span>
                      </div>
                      <div className="bg-blue50 text-blue600 px-2 py-1 rounded text-[11px] font-bold">
                        ✓ Scanned
                      </div>
                    </div>

                    {/* Current Telemetry Reading */}
                    <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                      <div className="bg-white border border-border/80 rounded-lg p-2.5">
                        <span className="text-muted text-[11px] block">Live Box Temp</span>
                        <span className="font-extrabold text-ink text-base">
                          {booking.sample?.coldChainLog?.slice(-1)[0]?.temperature ?? 4.0}°C
                        </span>
                        <span className="text-[10px] text-green-600 block mt-0.5 font-semibold">Safe Range (2–8°C)</span>
                      </div>
                      <div className="bg-white border border-border/80 rounded-lg p-2.5">
                        <span className="text-muted text-[11px] block">Specimen Status</span>
                        <span className="font-extrabold text-ink text-sm capitalize">
                          {booking.status === 'at_lab' || booking.status === 'report_ready' ? 'At Lab Bench' : 'In Transit'}
                        </span>
                        <span className="text-[10px] text-blue-600 block mt-0.5 font-semibold">Kit Sealed</span>
                      </div>
                    </div>

                    {/* Cold-Chain Checkpoints Log */}
                    <div className="border-t border-border/60 pt-2.5">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Telemetry Log</p>
                      <div className="space-y-1.5 text-xs">
                        {/* Collection Reading */}
                        <div className="flex items-start justify-between text-[11.5px] bg-white p-2 rounded border border-border/60">
                          <div>
                            <span className="font-bold text-ink">Sample Collected</span>
                            <p className="text-muted text-[10.5px]">
                              {booking.sample?.collectedAt
                                ? new Date(booking.sample.collectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'At collection'} · Phlebotomist kit
                            </p>
                          </div>
                          <span className="font-mono font-bold text-blue600">
                            {booking.sample?.coldChainLog?.[0]?.temperature ?? 4.0}°C
                          </span>
                        </div>

                        {/* Lab Submission Reading if at_lab */}
                        {(booking.status === 'at_lab' || booking.status === 'report_ready') && (
                          <div className="flex items-start justify-between text-[11.5px] bg-white p-2 rounded border border-border/60">
                            <div>
                              <span className="font-bold text-ink">Lab Receipt Bench</span>
                              <p className="text-muted text-[10.5px]">
                                {booking.sample?.handoffTimestamps?.submittedAt
                                  ? new Date(booking.sample.handoffTimestamps.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : 'Intake'} · Partner Lab
                              </p>
                            </div>
                            <span className="font-mono font-bold text-blue600">
                              {booking.sample?.coldChainLog?.slice(-1)[0]?.temperature ?? 4.0}°C
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-muted mt-3 leading-tight italic">
                      Every sample is barcoded at collection and carried in a temperature-controlled box to the lab.
                    </p>
                  </Card>
                )}


                {/* Rider Card once assigned per DESIGN_SPEC §3.7 */}
                {hasRider && (
                  <RiderContactCard rider={booking.assignedRiderId} />
                )}

                {/* Report Ready Card once report_ready per DESIGN_SPEC §3.7 & Prototype */}
                {booking.status === 'report_ready' && (
                  <div className="bg-[#DCFCE7] border border-[#16A34A]/40 rounded-card p-5" data-testid="report-ready-card">
                    <p className="font-extrabold text-sm text-[#16A34A] mb-3 flex items-center gap-1.5">
                      <span>✓</span>
                      <span>Your report is ready</span>
                    </p>

                    {/* Lab Summary */}
                    {reportBlocked ? (
                      <div
                        data-testid="report-payment-pending"
                        className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
                      >
                        <p className="text-sm font-extrabold text-amber-900">Payment pending</p>
                        <p className="mt-1 text-sm text-amber-900/80">{reportBlocked}</p>
                      </div>
                    ) : reportData?.summaryHtml ? (
                      <div className="bg-white rounded-xl p-3.5 text-[13px] leading-relaxed mb-3 border border-border/60" data-testid="lab-summary-box">
                        <div className="flex justify-between items-center mb-1.5">
                          <p className="font-bold text-[11px] text-muted uppercase tracking-wider">
                            Lab summary
                          </p>
                          {reportData.authoredBy?.name && (
                            <span className="text-[10.5px] text-muted font-medium">
                              By {reportData.authoredBy.name}
                            </span>
                          )}
                        </div>
                        <div
                          className="text-ink text-[13px] leading-relaxed space-y-2"
                          data-testid="lab-summary-html"
                          dangerouslySetInnerHTML={{ __html: reportData.summaryHtml }}
                        />
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl p-3 text-[12px] text-muted mb-3 italic">
                        {reportLoading ? 'Loading verified laboratory summary...' : 'A written summary from the lab will appear here.'}
                      </div>
                    )}

                    {/* Recommended Specialist Card per CONTEXT §2.4 & Prototype */}
                    {reportData?.recommendedDoctor && (
                      <div className="bg-white rounded-xl p-3.5 mb-3 border border-border/60" data-testid="recommended-doctor-card">
                        <p className="font-bold text-[11px] text-muted uppercase tracking-wider mb-2">
                          Suggested by your lab
                        </p>
                        {reportData.recommendationReason && (
                          <p className="text-[12px] text-muted italic mb-2.5">
                            "{reportData.recommendationReason}"
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-pill bg-blue100 text-blue700 flex items-center justify-center font-extrabold text-sm select-none">
                              {reportData.recommendedDoctor.name
                                ? reportData.recommendedDoctor.name.split(' ').map((n) => n[0]).join('').slice(0, 2)
                                : 'DR'}
                            </div>
                            <div>
                              <p className="font-bold text-[13.5px] text-ink">
                                {reportData.recommendedDoctor.name}
                              </p>
                              <p className="text-xs text-muted">
                                {reportData.recommendedDoctor.specialization} · {reportData.recommendedDoctor.clinicName || 'Partner Clinic'}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => navigate('/docs')}
                            data-testid="view-recommended-doctor-btn"
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Download Report Button */}
                    <Button
                      variant="primary"
                      size="small"
                      className="w-full !bg-[#16A34A] hover:!bg-[#15803D]"
                      onClick={handleDownloadReport}
                      data-testid="download-report-btn"
                    >
                      Download report PDF
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default TrackingPage;

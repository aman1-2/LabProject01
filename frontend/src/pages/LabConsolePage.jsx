// frontend/src/pages/LabConsolePage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Chip, EmptyState, Modal, Input } from '../components/atoms';
import RichTextEditor from '../components/RichTextEditor';
import Icon from '../components/atoms/Icon.jsx';

import { CITY } from '../lib/locale.js';
export function LabConsolePage({ initialTab = 'queue' }) {
  const { user, api, logout } = useAuth();
  const navigate = useNavigate();

  // Active tab in sidebar
  const [activeTab, setActiveTab] = useState(initialTab); // 'queue' | 'reports' | 'payments' | 'profile' | 'leads'
  const [statusFilter, setStatusFilter] = useState('all');

  // Data states
  const [bookings, setBookings] = useState([]);
  const [centreProfile, setCentreProfile] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Referral Leads state (for Admin pipeline)
  const [referralLeads, setReferralLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadFilterStatus, setLeadFilterStatus] = useState('all');
  const [leadSearch, setLeadSearch] = useState('');
  const [editingNotesLead, setEditingNotesLead] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');

  // Report Modal state
  const [selectedBookingForReport, setSelectedBookingForReport] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [reportSummaryHtml, setReportSummaryHtml] = useState('');
  const [recommendedDocId, setRecommendedDocId] = useState('');
  const [recommendationReason, setRecommendationReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Desktop viewport check (DESIGN_SPEC §3.10 and §5: Admin consoles are desktop only)
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch queue data
  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const res = await api.get('/api/lab/queue', { params });
      setBookings(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load booking queue');
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter]);

  // Fetch centre profile
  const fetchProfile = useCallback(async () => {
    try {
      const res = await api.get('/api/lab/profile');
      setCentreProfile(res.data?.data || null);
    } catch (err) {
      console.error('Failed to fetch centre profile', err);
    }
  }, [api]);

  // Fetch doctors for recommendation picker
  const fetchDoctors = useCallback(async () => {
    try {
      const res = await api.get('/api/doctors');
      setDoctors(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch doctors', err);
    }
  }, [api]);

  useEffect(() => {
    fetchQueue();
    fetchProfile();
    fetchDoctors();
  }, [fetchQueue, fetchProfile, fetchDoctors]);

  // Fetch referral recruitment leads
  const fetchReferralLeads = useCallback(async () => {
    try {
      setLoadingLeads(true);
      const params = {};
      if (leadFilterStatus !== 'all') params.status = leadFilterStatus;
      if (leadSearch.trim()) params.search = leadSearch.trim();
      const res = await api.get('/api/admin/referral-leads', { params });
      setReferralLeads(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load referral leads', err);
    } finally {
      setLoadingLeads(false);
    }
  }, [api, leadFilterStatus, leadSearch]);

  useEffect(() => {
    if (activeTab === 'leads') {
      fetchReferralLeads();
    }
  }, [activeTab, fetchReferralLeads]);

  // Update referral lead status
  const handleUpdateLeadStatus = async (leadId, newStatus) => {
    try {
      const res = await api.patch(`/api/admin/referral-leads/${leadId}`, { status: newStatus });
      const updated = res.data?.data;
      setReferralLeads((prev) =>
        prev.map((lead) => (lead._id === leadId ? updated || { ...lead, status: newStatus } : lead))
      );
      showToast(`Lead status updated to ${newStatus}`);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update lead status');
    }
  };

  const handleOpenNotesModal = (lead) => {
    setEditingNotesLead(lead);
    setNotesDraft(lead.notes || '');
  };

  const handleSaveLeadNotes = async () => {
    if (!editingNotesLead) return;
    try {
      const res = await api.patch(`/api/admin/referral-leads/${editingNotesLead._id}`, { notes: notesDraft });
      const updated = res.data?.data;
      setReferralLeads((prev) =>
        prev.map((lead) => (lead._id === editingNotesLead._id ? updated || { ...lead, notes: notesDraft } : lead))
      );
      setEditingNotesLead(null);
      showToast('Lead recruitment notes saved');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to save notes');
    }
  };

  // Confirm arrival for lab-visit booking
  const handleConfirmArrival = async (bookingId) => {
    try {
      await api.patch(`/api/lab/bookings/${bookingId}/confirm`);
      showToast(`Booking confirmed on arrival.`);
      fetchQueue();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to confirm booking');
    }
  };

  // Confirm cash payment at centre
  const handleConfirmCash = async (bookingId) => {
    try {
      await api.post(`/api/lab/bookings/${bookingId}/cash-received`);
      showToast(`Cash payment marked as received.`);
      fetchQueue();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to record cash payment');
    }
  };

  // Open report editor modal
  const handleOpenReportEditor = (booking) => {
    setSelectedBookingForReport(booking);
    setPdfFile(null);
    setReportSummaryHtml('');
    setRecommendedDocId('');
    setRecommendationReason('');
    setUploadError(null);
  };

  // Submit and publish report
  const handlePublishReport = async () => {
    if (!selectedBookingForReport) return;
    if (!reportSummaryHtml || reportSummaryHtml.trim() === '<p></p>') {
      setUploadError('Please write a summary before publishing.');
      return;
    }

    try {
      setIsSubmittingReport(true);
      setUploadError(null);

      let pdfKey = `reports/${selectedBookingForReport.labCenterId || 'lab'}/${selectedBookingForReport._id}/report.pdf`;

      // 1. If file provided, get presigned upload URL and PUT to S3
      if (pdfFile) {
        const uploadRes = await api.post(
          `/api/lab/reports/${selectedBookingForReport._id}/upload-url`,
          {
            contentType: pdfFile.type || 'application/pdf',
            fileName: pdfFile.name,
          }
        );
        const { uploadUrl, key } = uploadRes.data?.data || {};
        if (key) pdfKey = key;

        if (uploadUrl) {
          await fetch(uploadUrl, {
            method: 'PUT',
            body: pdfFile,
            headers: {
              'Content-Type': pdfFile.type || 'application/pdf',
            },
          });
        }
      }

      // 2. Publish report with server-side sanitization
      await api.post(`/api/lab/reports/${selectedBookingForReport._id}/publish`, {
        pdfKey,
        summaryHtml: reportSummaryHtml,
        recommendedDoctorId: recommendedDocId || null,
        recommendationReason: recommendationReason.trim() || null,
      });

      showToast(`Report published successfully. Patient notified.`);
      setSelectedBookingForReport(null);
      fetchQueue();
    } catch (err) {
      setUploadError(err.response?.data?.error?.message || err.message || 'Failed to publish report');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Calculate badge counts
  const awaitingCount = bookings.filter((b) => b.status === 'awaiting_confirm').length;
  const readyForReportCount = bookings.filter((b) => b.status === 'at_lab').length;
  const pendingCashCount = bookings.filter((b) => b.paymentMode === 'cash' && b.paymentStatus === 'pending').length;

  // Format currency
  const formatCurrency = (amt) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amt);

  // If on a narrow/mobile display, show desktop-only advisory
  if (!isDesktop) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-card border border-border max-w-md shadow-card">
          <div className="w-14 h-14 bg-blue50 text-blue600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
           
          </div>
          <h1 className="text-xl font-extrabold text-ink mb-2">Desktop Workstation Only</h1>
          <p className="text-sm text-muted leading-relaxed mb-6">
            The PathCare Lab Centre Operational Console is built exclusively for desktop monitors (1024px and wider). Please open this URL on your laboratory computer.
          </p>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Back to PathCare Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex" data-testid="lab-console-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          data-testid="lab-console-toast"
          className="fixed top-6 left-1/2 -translate-x-1/2 bg-dark text-white px-5 py-3 rounded-xl font-semibold text-sm z-50 shadow-float animate-fade-in"
        >
          {toastMessage}
        </div>
      )}

      {/* 230px Dark Sidebar Console */}
      <aside className="w-[230px] bg-dark text-white flex flex-col justify-between flex-shrink-0 min-h-screen border-r border-dark/60 sticky top-0 h-screen">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => navigate('/')}>
              <span className="text-blue600 font-extrabold text-xl">Path</span>
              <span className="text-white font-extrabold text-xl">Care</span>
              <span className="text-[10px] font-bold bg-white/15 text-white/90 px-2 py-0.5 rounded-pill ml-1">
                Lab
              </span>
            </div>
            <p className="text-xs text-white/60 mt-1 font-semibold truncate">
              {centreProfile?.name || 'Lab Centre Console'}
            </p>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1" data-testid="lab-sidebar-nav">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              data-testid="tab-booking-queue"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                activeTab === 'queue' ? 'bg-blue600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>Booking Queue</span>
              {awaitingCount > 0 && (
                <span className="bg-amber-500 text-dark font-extrabold text-[10px] px-1.5 py-0.5 rounded-pill">
                  {awaitingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              data-testid="tab-upload-reports"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                activeTab === 'reports' ? 'bg-blue600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>Upload Reports</span>
              {readyForReportCount > 0 && (
                <span className="bg-blue500 text-white font-extrabold text-[10px] px-1.5 py-0.5 rounded-pill">
                  {readyForReportCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              data-testid="tab-cash-payments"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                activeTab === 'payments' ? 'bg-blue600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>Cash Payments</span>
              {pendingCashCount > 0 && (
                <span className="bg-amber-500 text-dark font-extrabold text-[10px] px-1.5 py-0.5 rounded-pill">
                  {pendingCashCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              data-testid="tab-centre-profile"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                activeTab === 'profile' ? 'bg-blue600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>Centre Profile</span>
              <span className="text-[10px] text-green-400">✓ Verified</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('leads')}
              data-testid="tab-referral-leads"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                activeTab === 'leads' ? 'bg-blue600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>Referral Leads</span>
              {referralLeads.length > 0 && (
                <span className="bg-purple-600 text-white font-extrabold text-[10px] px-1.5 py-0.5 rounded-pill">
                  {referralLeads.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer / User Profile */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="truncate mr-2">
              <p className="text-xs font-bold text-white truncate">{user?.name || 'Lab Administrator'}</p>
              <p className="text-[11px] text-white/50 truncate">@{user?.accountHandle || 'labadmin'}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign Out"
              className="text-white/60 hover:text-red-400 text-xs font-semibold p-1.5 rounded hover:bg-white/10 transition cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 p-8 overflow-y-auto max-w-[1300px]" data-testid="lab-main-content">
        {/* ================= TAB 1: BOOKING QUEUE ================= */}
        {activeTab === 'queue' && (
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-extrabold text-ink">Booking Queue</h1>
                <p className="text-sm text-muted mt-1">
                  Confirm lab-visit bookings on arrival. Unconfirmed visit slots auto-cancel 8 hours after the booked time.
                </p>
              </div>

              {/* Status Filter Chips */}
              <div className="flex gap-1.5 bg-white p-1 rounded-xl border border-border">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'awaiting_confirm', label: 'Awaiting Confirm' },
                  { id: 'confirmed', label: 'Confirmed' },
                  { id: 'collected', label: 'Collected' },
                  { id: 'at_lab', label: 'At Lab' },
                  { id: 'report_ready', label: 'Report Ready' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      statusFilter === f.id ? 'bg-blue600 text-white' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Amber Alert Banner when bookings await confirmation */}
            {awaitingCount > 0 && (
              <div
                data-testid="awaiting-confirmation-banner"
                className="bg-amberBg border border-amber/30 rounded-card p-4 mb-5 flex items-center gap-3 text-amber-900"
              >
                <Icon name="alert" size={16} className="inline-block shrink-0" />
                <div>
                  <p className="font-extrabold text-xs uppercase tracking-wider text-amber-900">
                    Action Required
                  </p>
                  <p className="text-sm font-medium">
                    <b>{awaitingCount} booking(s) awaiting your confirmation.</b> Confirm when the patient arrives, or they will auto-cancel.
                  </p>
                </div>
              </div>
            )}

            {/* Queue Table */}
            {loading ? (
              <div className="py-20 text-center text-muted font-semibold">Loading bookings...</div>
            ) : error ? (
              <div className="py-10 text-center text-danger font-semibold">{error}</div>
            ) : bookings.length === 0 ? (
              <EmptyState
                icon="clipboard"
                title="No bookings for this centre yet"
                description="Bookings routed to your diagnostic centre will appear here as patients book them."
              />
            ) : (
              <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm">
                <div className="grid grid-cols-[1.4fr_1.6fr_1fr_1fr_1.2fr] px-5 py-3.5 bg-blue50 font-extrabold text-[11.5px] text-muted tracking-wider uppercase border-b border-border">
                  <span>Booking</span>
                  <span>Test</span>
                  <span>Mode</span>
                  <span>Payment</span>
                  <span>Action</span>
                </div>

                <div className="divide-y divide-border">
                  {bookings.map((b) => (
                    <div
                      key={b._id}
                      data-testid={`queue-row-${b._id}`}
                      className={`grid grid-cols-[1.4fr_1.6fr_1fr_1fr_1.2fr] px-5 py-4 items-center text-sm transition ${
                        b.nearAutoCancel ? 'bg-amber-50/60 border-l-4 border-amber-500' : 'hover:bg-gray-50/70'
                      }`}
                    >
                      {/* Booking ID & Patient info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-ink">#{b._id.slice(-6).toUpperCase()}</span>
                          {b.nearAutoCancel && (
                            <span
                              data-testid="near-autocancel-badge"
                              className="bg-redBg text-redDark text-[10px] font-extrabold px-1.5 py-0.5 rounded-pill"
                            >
                              Auto-cancels in {b.autoCancelHoursLeft}h
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                          {b.patientId?.name || 'Patient'} · {new Date(b.slotDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Tests */}
                      <span className="font-medium text-ink truncate pr-2">
                        {b.testIds?.map((t) => t.name).join(', ') || 'Diagnostic Test'}
                      </span>

                      {/* Mode */}
                      <div>
                        <Chip variant={b.mode === 'home' ? 'grey' : 'blue'}>
                          {b.mode === 'home' ? 'Home' : 'Lab visit'}
                        </Chip>
                      </div>

                      {/* Payment */}
                      <div>
                        <Chip variant={b.paymentStatus === 'paid' ? 'green' : 'amber'}>
                          {b.paymentMode?.toUpperCase()} · {b.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                        </Chip>
                      </div>

                      {/* Action */}
                      <div>
                        {b.status === 'awaiting_confirm' ? (
                          <Button
                            size="small"
                            onClick={() => handleConfirmArrival(b._id)}
                            data-testid={`confirm-btn-${b._id}`}
                          >
                            Confirm Arrival
                          </Button>
                        ) : (
                          <Chip variant={b.status === 'report_ready' ? 'green' : 'blue'}>
                            {b.status.replace(/_/g, ' ')}
                          </Chip>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: UPLOAD REPORTS ================= */}
        {activeTab === 'reports' && (
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Upload Reports</h1>
            <p className="text-sm text-muted mt-1 mb-6">
              Scan and upload the report, write a plain-language summary for the patient, and optionally attach a specialist recommendation.
            </p>

            {(() => {
              const eligibleForReports = bookings.filter((b) => ['at_lab', 'report_ready'].includes(b.status));

              if (eligibleForReports.length === 0) {
                return (
                  <EmptyState
                    icon="testTube"
                    title="Nothing awaiting a report"
                    description="Once a sample reaches the lab, it appears here for report upload."
                  />
                );
              }

              return (
                <div className="space-y-4">
                  {eligibleForReports.map((b) => (
                    <Card key={b._id} className="p-5" data-testid={`report-booking-card-${b._id}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-extrabold text-base text-ink">
                            {b.testIds?.map((t) => t.name).join(', ') || 'Diagnostic Test'}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            #{b._id.slice(-6).toUpperCase()} · {b.patientId?.name || 'Patient'} · sample {b.barcode || '—'}
                          </p>
                        </div>

                        {b.status === 'report_ready' ? (
                          <Chip variant="green">Report published</Chip>
                        ) : (
                          <Button
                            size="small"
                            onClick={() => handleOpenReportEditor(b)}
                            data-testid={`upload-report-btn-${b._id}`}
                          >
                            Upload & write summary
                          </Button>
                        )}
                      </div>

                      {/* Display Published Summary if already ready */}
                      {b.report?.summaryHtml && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
                            Summary sent to patient
                          </p>
                          <div
                            className="bg-blue50 p-3.5 rounded-xl text-xs leading-relaxed text-ink"
                            dangerouslySetInnerHTML={{ __html: b.report.summaryHtml }}
                          />
                          {b.report.recommendedDoctorId && (
                            <p className="text-xs text-blue700 font-semibold mt-2.5">
                              <b>Recommended:</b> {b.report.recommendedDoctorId.name} — {b.report.recommendedDoctorId.specialization} ({b.report.recommendationReason || 'Clinical review'})
                            </p>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ================= TAB 3: CASH PAYMENTS ================= */}
        {activeTab === 'payments' && (
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Cash Payments</h1>
            <p className="text-sm text-muted mt-1 mb-6">
              Bookings paid in cash need manual confirmation before the accounts reconcile.
            </p>

            {(() => {
              const cashBookings = bookings.filter((b) => b.paymentMode === 'cash');

              if (cashBookings.length === 0) {
                return (
                  <EmptyState
                    icon="rupee"
                    title="No cash bookings"
                    description="Cash-payment bookings for this centre appear here for confirmation."
                  />
                );
              }

              return (
                <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm">
                  <div className="grid grid-cols-[1.4fr_1.6fr_1fr_1.2fr] px-5 py-3.5 bg-blue50 font-extrabold text-[11.5px] text-muted tracking-wider uppercase border-b border-border">
                    <span>Booking</span>
                    <span>Test</span>
                    <span>Amount</span>
                    <span>Status / Action</span>
                  </div>

                  <div className="divide-y divide-border">
                    {cashBookings.map((b) => (
                      <div
                        key={b._id}
                        data-testid={`cash-row-${b._id}`}
                        className="grid grid-cols-[1.4fr_1.6fr_1fr_1.2fr] px-5 py-4 items-center text-sm hover:bg-gray-50/70 transition"
                      >
                        <div>
                          <span className="font-mono font-bold text-ink">#{b._id.slice(-6).toUpperCase()}</span>
                          <p className="text-xs text-muted mt-0.5">{b.patientId?.name || 'Patient'}</p>
                        </div>
                        <span className="font-medium text-ink truncate pr-2">
                          {b.testIds?.map((t) => t.name).join(', ') || 'Diagnostic Test'}
                        </span>
                        <span className="font-extrabold text-ink">{formatCurrency(b.amount || 0)}</span>
                        <div>
                          {b.paymentStatus === 'paid' ? (
                            <Chip variant="green">Confirmed</Chip>
                          ) : (
                            <Button
                              size="small"
                              onClick={() => handleConfirmCash(b._id)}
                              data-testid={`mark-received-btn-${b._id}`}
                            >
                              Mark received
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ================= TAB 4: CENTRE PROFILE ================= */}
        {activeTab === 'profile' && (
          <div>
            <h1 className="text-2xl font-extrabold text-ink mb-6">Centre Profile</h1>

            <div className="bg-white border border-border rounded-card p-6 max-w-[560px] shadow-sm">
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-border/70">
                  <span className="text-sm font-semibold text-muted">Centre name</span>
                  <span className="text-sm font-extrabold text-ink">{centreProfile?.name || '—'}</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-border/70">
                  <span className="text-sm font-semibold text-muted">Area</span>
                  <span className="text-sm font-medium text-ink">{centreProfile?.area || CITY}</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-border/70">
                  <span className="text-sm font-semibold text-muted">NABL Accreditation</span>
                  <Chip variant={centreProfile?.accreditation?.nabl ? 'green' : 'amber'}>
                    {centreProfile?.accreditation?.nabl ? 'Verified' : 'Pending'}
                  </Chip>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-border/70">
                  <span className="text-sm font-semibold text-muted">ISO 9001:2015</span>
                  <Chip variant={centreProfile?.accreditation?.iso ? 'green' : 'amber'}>
                    {centreProfile?.accreditation?.iso ? 'Verified' : 'Pending'}
                  </Chip>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-border/70">
                  <span className="text-sm font-semibold text-muted">Average turnaround</span>
                  <span className="text-sm font-bold text-ink">{centreProfile?.turnaroundHrs || 6} hours</span>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-semibold text-muted">Platform status</span>
                  <Chip variant="green">Live</Chip>
                </div>
              </div>

              <p className="text-xs text-muted mt-6 pt-4 border-t border-border/80 leading-relaxed italic">
                Accreditation is re-verified annually. A centre cannot receive bookings while any accreditation is expired.
              </p>
            </div>
          </div>
        )}

        {/* ================= TAB 5: REFERRAL LEADS ================= */}
        {activeTab === 'leads' && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-extrabold text-ink">Doctor Referral Recruitment Pipeline</h1>
                <p className="text-sm text-muted mt-1">
                  External doctors named by patients at booking. High-volume prescribers are prioritized for platform onboarding.
                </p>
              </div>

              {/* Status Filter & Search */}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search doctor or clinic..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className="px-3 py-2 text-xs border border-border rounded-xl bg-white text-ink outline-none focus:border-blue600 w-52"
                  data-testid="lead-search-input"
                />
                <select
                  value={leadFilterStatus}
                  onChange={(e) => setLeadFilterStatus(e.target.value)}
                  className="px-3 py-2 text-xs border border-border rounded-xl bg-white text-ink outline-none focus:border-blue600"
                  data-testid="lead-filter-status"
                >
                  <option value="all">All Statuses</option>
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="In discussion">In discussion</option>
                  <option value="Converted">Converted</option>
                  <option value="Declined">Declined</option>
                </select>
              </div>
            </div>

            {loadingLeads ? (
              <div className="p-12 text-center text-sm text-muted" data-testid="leads-loading">Loading referral leads...</div>
            ) : referralLeads.length === 0 ? (
              <EmptyState
                icon="stethoscope"
                title="No external referral leads"
                description="When patients enter an external referring doctor name during booking, they will appear here ranked by patient volume."
              />
            ) : (
              <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm" data-testid="referral-leads-table">
                <div className="grid grid-cols-[60px_2.2fr_1.1fr_1.5fr_2fr_1.2fr] px-5 py-3.5 bg-blue50 font-extrabold text-[11px] text-muted tracking-wider uppercase border-b border-border">
                  <span>Rank</span>
                  <span>Doctor Name</span>
                  <span>Mentions</span>
                  <span>Pipeline Status</span>
                  <span>Recruitment Notes</span>
                  <span>Last Mentioned</span>
                </div>

                <div className="divide-y divide-border">
                  {referralLeads.map((lead, idx) => (
                    <div
                      key={lead._id}
                      data-testid={`lead-row-${lead._id}`}
                      className="grid grid-cols-[60px_2.2fr_1.1fr_1.5fr_2fr_1.2fr] px-5 py-4 items-center text-sm hover:bg-gray-50/70 transition"
                    >
                      {/* Rank */}
                      <span className="font-mono font-bold text-muted text-xs">#{idx + 1}</span>

                      {/* Doctor Name */}
                      <div className="pr-3">
                        <p className="font-bold text-ink text-sm" data-testid={`lead-name-${lead._id}`}>{lead.rawName || lead.normalizedName}</p>
                        <p className="text-[11px] text-muted truncate">Norm: {lead.normalizedName}</p>
                      </div>

                      {/* Mentions */}
                      <div>
                        <span
                          data-testid={`lead-mentions-${lead._id}`}
                          className="inline-flex items-center px-2.5 py-1 rounded-pill text-xs font-extrabold bg-blue100 text-blue700"
                        >
                          {lead.mentionCount} {lead.mentionCount === 1 ? 'patient' : 'patients'}
                        </span>
                      </div>

                      {/* Status Dropdown */}
                      <div className="pr-3">
                        <select
                          value={lead.status}
                          onChange={(e) => handleUpdateLeadStatus(lead._id, e.target.value)}
                          data-testid={`lead-status-select-${lead._id}`}
                          className={`w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer ${
                            lead.status === 'Converted'
                              ? 'bg-green-50 border-green-300 text-green-700'
                              : lead.status === 'Contacted'
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : lead.status === 'In discussion'
                              ? 'bg-amber-50 border-amber-300 text-amber-700'
                              : lead.status === 'Declined'
                              ? 'bg-gray-100 border-gray-300 text-gray-600'
                              : 'bg-purple-50 border-purple-300 text-purple-700'
                          }`}
                        >
                          <option value="New">New</option>
                          <option value="Contacted">Contacted</option>
                          <option value="In discussion">In discussion</option>
                          <option value="Converted">Converted</option>
                          <option value="Declined">Declined</option>
                        </select>
                      </div>

                      {/* Notes with Edit Trigger */}
                      <div className="pr-3">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className="text-xs text-muted truncate max-w-[200px]"
                            title={lead.notes || 'No notes added'}
                            data-testid={`lead-notes-${lead._id}`}
                          >
                            {lead.notes || <span className="italic text-muted/60">No notes yet</span>}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleOpenNotesModal(lead)}
                            data-testid={`lead-edit-notes-btn-${lead._id}`}
                            className="text-[11px] font-bold text-blue600 hover:text-blue800 flex-shrink-0 cursor-pointer"
                          >
                            Edit
                          </button>
                        </div>
                      </div>

                      {/* Last Mentioned Date */}
                      <div className="text-xs text-muted">
                        {lead.lastMentionedAt ? new Date(lead.lastMentionedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ================= MODAL: UPLOAD REPORT & RICH TEXT SUMMARY ================= */}
      <Modal
        isOpen={Boolean(selectedBookingForReport)}
        onClose={() => setSelectedBookingForReport(null)}
        title={`Report & summary — #${selectedBookingForReport?._id.slice(-6).toUpperCase()}`}
        className="max-w-[560px]"
      >
        {selectedBookingForReport && (
          <div className="space-y-4">
            <p className="text-xs text-muted -mt-2">
              {selectedBookingForReport.testIds?.map((t) => t.name).join(', ')} · {selectedBookingForReport.patientId?.name}
            </p>

            {uploadError && (
              <div className="bg-redBg border border-redDark/20 p-2.5 rounded-lg text-xs text-redDark font-semibold">
                {uploadError}
              </div>
            )}

            {/* PDF File Picker Dropzone */}
            <div className="border-1.5 border-dashed border-border rounded-xl p-4 text-center bg-[#FAFBFD]">
              <Icon name="file" size={22} className="inline-block shrink-0" />
              <p className="text-xs font-bold text-ink">
                {pdfFile ? pdfFile.name : 'Scan or upload report PDF'}
              </p>
              <p className="text-[11px] text-muted mt-0.5">PDF or JPG, up to 10 MB</p>
              <label className="inline-block mt-2 px-3 py-1 bg-white border border-border rounded-pill text-xs font-bold text-blue600 hover:border-blue600 cursor-pointer transition">
                <span>{pdfFile ? 'Change file' : 'Select PDF file'}</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setPdfFile(e.target.files[0]);
                  }}
                />
              </label>
            </div>

            {/* Rich Text Editor for Summary */}
            <div>
              <label className="block text-xs font-extrabold text-ink mb-1.5">
                Summary for the patient
              </label>
              <RichTextEditor
                value={reportSummaryHtml}
                onChange={setReportSummaryHtml}
                placeholder="e.g. Haemoglobin is slightly below normal range. Thyroid values are within limits..."
              />
              <p className="text-[11px] text-muted2 mt-1">
                Written by the reporting pathologist. Recorded against your login with an edit history.
              </p>
            </div>

            {/* Doctor Recommendation */}
            <div>
              <label className="block text-xs font-extrabold text-ink mb-1.5">
                Recommend a specialist <span className="font-normal text-muted">(optional)</span>
              </label>
              <select
                value={recommendedDocId}
                onChange={(e) => setRecommendedDocId(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-white text-ink outline-none focus:border-blue600"
                data-testid="doctor-recommendation-picker"
              >
                <option value="">No recommendation</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name} — {d.specialization} ({d.clinicName || 'Clinic'})
                  </option>
                ))}
              </select>
            </div>

            {/* Recommendation Reason */}
            <div>
              <Input
                placeholder="Reason (e.g. low haemoglobin, specialist review recommended)"
                value={recommendationReason}
                onChange={(e) => setRecommendationReason(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Publish Action Button */}
            <div className="pt-2">
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={handlePublishReport}
                disabled={isSubmittingReport}
                data-testid="publish-report-submit-btn"
              >
                {isSubmittingReport ? 'Publishing report...' : 'Publish report to patient'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= MODAL: EDIT LEAD NOTES ================= */}
      <Modal
        isOpen={Boolean(editingNotesLead)}
        onClose={() => setEditingNotesLead(null)}
        title={`Recruitment Notes — ${editingNotesLead?.rawName || editingNotesLead?.normalizedName}`}
        className="max-w-[500px]"
      >
        {editingNotesLead && (
          <div className="space-y-4">
            <p className="text-xs text-muted -mt-2">
              Mentioned by {editingNotesLead.mentionCount} patients · Current status: <b>{editingNotesLead.status}</b>
            </p>
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">
                Internal Outreach Notes
              </label>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="e.g. Spoke with Dr. Sharma's clinic assistant. Invited to onboarding meeting next Tuesday..."
                rows={4}
                className="w-full border border-border rounded-xl p-3 text-xs bg-white text-ink outline-none focus:border-blue600 resize-none"
                data-testid="lead-notes-textarea"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="small" onClick={() => setEditingNotesLead(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="small"
                onClick={handleSaveLeadNotes}
                data-testid="lead-notes-save-btn"
              >
                Save Notes
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default LabConsolePage;

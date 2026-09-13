// frontend/src/pages/AdminConsolePage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Chip, EmptyState, Modal } from '../components/atoms';
import AdminCreateModal from '../components/organisms/AdminCreateModal.jsx';
import IssuedCredentials from '../components/organisms/IssuedCredentials.jsx';

export function AdminConsolePage({ initialTab = 'overview' }) {
  const { user, api, logout } = useAuth();
  const navigate = useNavigate();

  /**
   * Which create form is open, and the credentials the last one produced.
   *
   * `issued` is separate from the form state on purpose: the form closes on
   * success and the password has to survive that. It lives only in memory, and
   * only until the admin confirms they have it — the server will not produce
   * it again.
   */
  const [creating, setCreating] = useState(null); // 'lab' | 'rider' | 'doctor' | 'labAdmin'
  const [issued, setIssued] = useState(null); // { subject, credentials }

  // Active tab in sidebar
  const [activeTab, setActiveTab] = useState(initialTab); // 'overview' | 'bookings' | 'labs' | 'riders' | 'doctors' | 'referrals' | 'feedback'

  // Overview metrics state
  const [overviewData, setOverviewData] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // Bookings tab state
  const [bookingsList, setBookingsList] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Labs tab state
  const [labsList, setLabsList] = useState([]);
  const [loadingLabs, setLoadingLabs] = useState(false);

  // Riders tab state
  const [ridersList, setRidersList] = useState([]);
  const [loadingRiders, setLoadingRiders] = useState(false);

  // Doctors tab state
  const [doctorsList, setDoctorsList] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  // Referral leads state
  const [leadsList, setLeadsList] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [editingNotesLead, setEditingNotesLead] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');

  // Feedback tab state
  const [feedbackList, setFeedbackList] = useState([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  // Global toast
  const [toastMessage, setToastMessage] = useState(null);

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

  const formatCurrency = (amt) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amt || 0);

  // Fetch Overview Data
  const fetchOverview = useCallback(async () => {
    try {
      setLoadingOverview(true);
      const res = await api.get('/api/admin/overview');
      setOverviewData(res.data?.data || null);
    } catch (err) {
      console.error('Failed to fetch overview data', err);
    } finally {
      setLoadingOverview(false);
    }
  }, [api]);

  // Fetch Bookings Data
  const fetchBookings = useCallback(async () => {
    try {
      setLoadingBookings(true);
      const res = await api.get('/api/admin/bookings');
      setBookingsList(res.data?.data?.bookings || []);
    } catch (err) {
      console.error('Failed to fetch bookings list', err);
    } finally {
      setLoadingBookings(false);
    }
  }, [api]);

  // Fetch Labs Data
  const fetchLabs = useCallback(async () => {
    try {
      setLoadingLabs(true);
      const res = await api.get('/api/admin/labs');
      setLabsList(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch labs list', err);
    } finally {
      setLoadingLabs(false);
    }
  }, [api]);

  // Fetch Riders Data
  const fetchRiders = useCallback(async () => {
    try {
      setLoadingRiders(true);
      const res = await api.get('/api/admin/riders');
      setRidersList(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch riders list', err);
    } finally {
      setLoadingRiders(false);
    }
  }, [api]);

  // Fetch Doctors Data
  const fetchDoctors = useCallback(async () => {
    try {
      setLoadingDoctors(true);
      const res = await api.get('/api/admin/doctors');
      setDoctorsList(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch doctors list', err);
    } finally {
      setLoadingDoctors(false);
    }
  }, [api]);

  // Fetch Referral Leads Data
  const fetchLeads = useCallback(async () => {
    try {
      setLoadingLeads(true);
      const res = await api.get('/api/admin/referral-leads');
      setLeadsList(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch referral leads', err);
    } finally {
      setLoadingLeads(false);
    }
  }, [api]);

  // Fetch Feedback Data
  const fetchFeedback = useCallback(async () => {
    try {
      setLoadingFeedback(true);
      const res = await api.get('/api/admin/feedback');
      setFeedbackList(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch feedback', err);
    } finally {
      setLoadingFeedback(false);
    }
  }, [api]);

  // Trigger fetch depending on activeTab
  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
    else if (activeTab === 'bookings') fetchBookings();
    else if (activeTab === 'labs') fetchLabs();
    else if (activeTab === 'riders') fetchRiders();
    else if (activeTab === 'doctors') fetchDoctors();
    else if (activeTab === 'referrals') fetchLeads();
    else if (activeTab === 'feedback') fetchFeedback();
  }, [activeTab, fetchOverview, fetchBookings, fetchLabs, fetchRiders, fetchDoctors, fetchLeads, fetchFeedback]);

  // Centres are loaded by the Labs tab, but the rider and lab-desk forms need
  // them wherever they are opened from. Without this an admin who goes straight
  // to Riders gets an empty "Home centre" dropdown and cannot submit.
  useEffect(() => {
    if ((creating === 'rider' || creating === 'labAdmin') && labsList.length === 0) {
      fetchLabs();
    }
  }, [creating, labsList.length, fetchLabs]);

  // Toggle Lab Verification
  const handleToggleVerifyLab = async (labId, currentStatus) => {
    try {
      const res = await api.patch(`/api/admin/labs/${labId}/verify`, { isVerified: !currentStatus });
      const updated = res.data?.data;
      setLabsList((prev) =>
        prev.map((l) => (l._id === labId ? { ...l, isVerified: updated?.isVerified ?? !currentStatus } : l))
      );
      showToast(`Lab verification updated`);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update lab verification');
    }
  };

  // ── Creating staff and centres ────────────────────────────────────────────
  // No password field anywhere below: the server generates it and hands it
  // back once, which is why `issued` exists.

  async function createLabCentre(values) {
    await api.post('/api/admin/labs', {
      name: values.name,
      area: values.area,
      address: values.address,
      lat: Number(values.lat),
      lng: Number(values.lng),
      priceMultiplier: Number(values.priceMultiplier || 1),
      turnaroundHrs: Number(values.turnaroundHrs || 24),
      accreditation: { nabl: Boolean(values.nabl), iso: Boolean(values.iso) },
    });
    setCreating(null);
    showToast('Lab centre created — verify it before it can take bookings');
    fetchLabs();
  }

  async function createDoctor(values) {
    const res = await api.post('/api/admin/doctors', {
      accountHandle: values.accountHandle,
      name: values.name,
      phone: values.phone,
      specialization: values.specialization,
      clinicName: values.clinicName,
      ...(values.clinicAddress ? { clinicAddress: values.clinicAddress } : {}),
      consultationFee: Number(values.consultationFee),
      walkInFee: Number(values.walkInFee),
      ...(values.qualification ? { qualification: values.qualification } : {}),
    });
    setCreating(null);
    setIssued({ subject: 'Doctor', credentials: res.data?.data?.credentials });
    fetchDoctors();
  }

  async function createRider(values) {
    const res = await api.post('/api/admin/riders', {
      accountHandle: values.accountHandle,
      name: values.name,
      phone: values.phone,
      labCenterId: values.labCenterId,
      ...(values.kitId ? { kitId: values.kitId } : {}),
    });
    setCreating(null);
    setIssued({ subject: 'Phlebotomist', credentials: res.data?.data?.credentials });
    fetchRiders();
  }

  async function createLabAdmin(values) {
    const res = await api.post('/api/admin/lab-admins', {
      accountHandle: values.accountHandle,
      name: values.name,
      phone: values.phone,
      labCenterId: values.labCenterId,
    });
    setCreating(null);
    setIssued({ subject: 'Lab desk login', credentials: res.data?.data?.credentials });
  }

  /** Centres, for the pickers. A rider or a desk must belong to one. */
  const labOptions = labsList.map((lab) => ({ value: lab._id || lab.id, label: lab.name }));

  // Toggle Doctor Verification
  const handleToggleVerifyDoctor = async (doctorId, currentStatus) => {
    try {
      const res = await api.patch(`/api/admin/doctors/${doctorId}/verify`, { isVerified: !currentStatus });
      const updated = res.data?.data;
      setDoctorsList((prev) =>
        prev.map((d) => (d._id === doctorId ? { ...d, isVerified: updated?.isVerified ?? !currentStatus } : d))
      );
      showToast(`Doctor verification updated`);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update doctor verification');
    }
  };

  // Update Lead Status
  const handleUpdateLeadStatus = async (leadId, newStatus) => {
    try {
      const res = await api.patch(`/api/admin/referral-leads/${leadId}`, { status: newStatus });
      const updated = res.data?.data;
      setLeadsList((prev) =>
        prev.map((lead) => (lead._id === leadId ? updated || { ...lead, status: newStatus } : lead))
      );
      showToast(`Lead status updated to ${newStatus}`);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update lead status');
    }
  };

  // Save Lead Notes
  const handleSaveLeadNotes = async () => {
    if (!editingNotesLead) return;
    try {
      const res = await api.patch(`/api/admin/referral-leads/${editingNotesLead._id}`, { notes: notesDraft });
      const updated = res.data?.data;
      setLeadsList((prev) =>
        prev.map((lead) => (lead._id === editingNotesLead._id ? updated || { ...lead, notes: notesDraft } : lead))
      );
      setEditingNotesLead(null);
      showToast('Lead notes saved');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to save notes');
    }
  };

  // If on a narrow display, show desktop-only advisory
  if (!isDesktop) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-card border border-border max-w-md shadow-card">
          <div className="w-14 h-14 bg-blue50 text-blue600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
           
          </div>
          <h1 className="text-xl font-extrabold text-ink mb-2">Desktop Workstation Only</h1>
          <p className="text-sm text-muted leading-relaxed mb-6">
            The PathCare Super Admin Console is built exclusively for desktop monitors (1024px and wider). Please open this dashboard on a desktop computer.
          </p>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Back to PathCare Home
          </Button>
        </div>
      </div>
    );
  }

  // Today numbers
  const today = overviewData?.today || {
    bookingsCount: 0,
    revenue: 0,
    revenuePending: 0,
    reportsDelivered: 0,
    modeSplit: { home: 0, visit: 0 },
    paymentSplit: { upi: 0, cash: 0 },
    perLabVolumes: [],
  };

  const totalBookingsToday = today.bookingsCount || 0;

  // Helper bar percentage
  const renderBar = (label, val, total) => {
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    return (
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-muted font-semibold">{label}</span>
          <span className="font-extrabold text-ink">{val}</span>
        </div>
        <div className="h-2 bg-blue50 rounded-pill overflow-hidden">
          <div
            className="h-full bg-blue600 rounded-pill transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-bg flex" data-testid="admin-console-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          data-testid="admin-console-toast"
          className="fixed top-6 left-1/2 -translate-x-1/2 bg-dark text-white px-5 py-3 rounded-xl font-semibold text-sm z-50 shadow-float animate-fade-in"
        >
          {toastMessage}
        </div>
      )}

      {/* 230px Dark Sidebar Console matching prototype */}
      <aside className="w-[230px] bg-dark text-white flex flex-col justify-between flex-shrink-0 min-h-screen border-r border-dark/60 sticky top-0 h-screen">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => navigate('/')}>
              <span className="text-blue600 font-extrabold text-xl">Path</span>
              <span className="text-white font-extrabold text-xl">Care</span>
              <span className="text-[10px] font-bold bg-white/15 text-white/90 px-2 py-0.5 rounded-pill ml-1">
                Admin
              </span>
            </div>
            <p className="text-xs text-white/60 mt-1 font-semibold truncate">
              Operations &amp; Network Console
            </p>
          </div>

          {/* Navigation Links — 7 Tabs matching prototype lines 939-940 */}
          <nav className="p-3 space-y-1" data-testid="admin-sidebar-nav">
            {[
              { id: 'overview', label: 'Overview', testId: 'tab-overview' },
              { id: 'bookings', label: 'Bookings', testId: 'tab-bookings' },
              { id: 'labs', label: 'Lab Centres', testId: 'tab-labs' },
              { id: 'riders', label: 'Riders', testId: 'tab-riders' },
              { id: 'doctors', label: 'Doctors', testId: 'tab-doctors' },
              { id: 'referrals', label: 'Referral Leads', testId: 'tab-referrals' },
              { id: 'feedback', label: 'Feedback', testId: 'tab-feedback' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                data-testid={tab.testId}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-blue600 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="truncate mr-2">
              <p className="text-xs font-bold text-white truncate">{user?.name || 'Super Admin'}</p>
              <p className="text-[11px] text-white/50 truncate">@{user?.accountHandle || 'admin'}</p>
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
      <main className="flex-1 p-8 overflow-y-auto max-w-[1300px]" data-testid="admin-main-content">
        {/* ================= TAB 1: BUSINESS OVERVIEW ================= */}
        {activeTab === 'overview' && (
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Business Overview</h1>
            <p className="text-sm text-muted mt-1 mb-6">
              Live figures from actual platform activity. Dehradun.
            </p>

            {loadingOverview ? (
              <div className="p-12 text-center text-sm text-muted">Loading overview metrics...</div>
            ) : (
              <div>
                {/* 4 KPI Cards matching prototype line 947 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="admin-kpi-grid">
                  <div className="bg-white p-5 rounded-card border border-border shadow-sm">
                    <p className="text-[11.5px] font-extrabold text-muted uppercase tracking-wider">BOOKINGS TODAY</p>
                    <p className="text-2xl font-extrabold text-blue600 mt-1.5" data-testid="kpi-bookings-today">
                      {today.bookingsCount}
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-card border border-border shadow-sm">
                    <p className="text-[11.5px] font-extrabold text-muted uppercase tracking-wider">REVENUE COLLECTED</p>
                    <p className="text-2xl font-extrabold text-blue600 mt-1.5" data-testid="kpi-revenue-collected">
                      {formatCurrency(today.revenue)}
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-card border border-border shadow-sm">
                    <p className="text-[11.5px] font-extrabold text-muted uppercase tracking-wider">PAYMENT PENDING</p>
                    <p className="text-2xl font-extrabold text-blue600 mt-1.5" data-testid="kpi-payment-pending">
                      {formatCurrency(today.revenuePending)}
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-card border border-border shadow-sm">
                    <p className="text-[11.5px] font-extrabold text-muted uppercase tracking-wider">REPORTS DELIVERED</p>
                    <p className="text-2xl font-extrabold text-blue600 mt-1.5" data-testid="kpi-reports-delivered">
                      {today.reportsDelivered}
                    </p>
                  </div>
                </div>

                {/* 2 Chart Cards matching prototype lines 949-957 */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5 mb-6">
                  {/* Mode & Payment Split */}
                  <Card className="p-6">
                    <p className="font-extrabold text-base text-ink mb-4">Bookings by mode</p>
                    {renderBar('Home collection', today.modeSplit?.home || 0, totalBookingsToday || 1)}
                    {renderBar('Lab visit', today.modeSplit?.visit || 0, totalBookingsToday || 1)}

                    <p className="font-extrabold text-base text-ink mt-6 mb-4">Payment split</p>
                    {renderBar('Paid online (UPI)', today.paymentSplit?.upi || 0, totalBookingsToday || 1)}
                    {renderBar('Cash', today.paymentSplit?.cash || 0, totalBookingsToday || 1)}
                  </Card>

                  {/* Per Lab Centre Volumes */}
                  <Card className="p-6">
                    <p className="font-extrabold text-base text-ink mb-4">Bookings per lab centre</p>
                    {today.perLabVolumes?.length > 0 ? (
                      today.perLabVolumes.map((l) => (
                        <div key={l.labId || l.labCenterId || l.labName}>
                          {renderBar(l.labName, l.count || 0, totalBookingsToday || 1)}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted italic">No active lab centres</p>
                    )}
                  </Card>
                </div>

                {/* Empty State Banner when 0 bookings exist matching prototype line 958 */}
                {totalBookingsToday === 0 && (
                  <div
                    data-testid="overview-zero-banner"
                    className="bg-white border-1.5 border-dashed border-border rounded-card p-8 text-center"
                  >
                    <p className="font-extrabold text-sm text-ink mb-1.5">No activity yet</p>
                    <p className="text-xs text-muted leading-relaxed max-w-md mx-auto">
                      These figures populate from real bookings. Make a booking in the patient flow to see them move.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: ALL BOOKINGS ================= */}
        {activeTab === 'bookings' && (
          <div>
            <h1 className="text-2xl font-extrabold text-ink mb-6">All Bookings</h1>

            {loadingBookings ? (
              <div className="p-12 text-center text-sm text-muted">Loading bookings...</div>
            ) : bookingsList.length === 0 ? (
              <EmptyState
                icon="chart"
                title="No bookings yet"
                description="Every booking across all lab centres appears here."
              />
            ) : (
              <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm" data-testid="admin-bookings-table">
                <div className="grid grid-cols-[1fr_1.5fr_1.2fr_1fr_1fr] px-5 py-3.5 bg-blue50 font-extrabold text-[11px] text-muted tracking-wider uppercase border-b border-border">
                  <span>ID</span>
                  <span>Test</span>
                  <span>Lab</span>
                  <span>Amount</span>
                  <span>Status</span>
                </div>
                <div className="divide-y divide-border">
                  {bookingsList.map((b) => (
                    <div
                      key={b._id}
                      data-testid={`admin-booking-row-${b._id}`}
                      className="grid grid-cols-[1fr_1.5fr_1.2fr_1fr_1fr] px-5 py-4 items-center text-xs hover:bg-gray-50/70 transition"
                    >
                      <span className="font-mono font-bold text-ink">#{b._id.slice(-6).toUpperCase()}</span>
                      <span className="font-medium text-ink truncate pr-2">
                        {b.testIds?.map((t) => t.name).join(', ') || 'Diagnostic Test'}
                      </span>
                      <span className="text-muted truncate pr-2">{b.labCenterId?.name || 'Lab Centre'}</span>
                      <span className="font-extrabold text-ink">{formatCurrency(b.amount)}</span>
                      <div>
                        <Chip variant={b.status === 'report_ready' ? 'green' : 'blue'}>
                          {b.status.replace(/_/g, ' ')}
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: LAB CENTRES ================= */}
        {activeTab === 'labs' && (
          <div>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-ink">Lab Centres</h1>
                <p className="text-sm text-muted mt-1">
                  A centre cannot receive bookings until verified.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="primary"
                  size="small"
                  data-testid="admin-add-lab"
                  onClick={() => setCreating('lab')}
                >
                  Add centre
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  data-testid="admin-add-lab-admin"
                  onClick={() => setCreating('labAdmin')}
                >
                  Add lab login
                </Button>
              </div>
            </div>

            {loadingLabs ? (
              <div className="p-12 text-center text-sm text-muted">Loading lab centres...</div>
            ) : labsList.length === 0 ? (
              <EmptyState
                icon="testTube"
                title="No lab centres onboarded"
                description="Lab centres partnered with PathCare appear here."
              />
            ) : (
              <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm" data-testid="admin-labs-table">
                <div className="grid grid-cols-[1.6fr_1.2fr_0.8fr_0.8fr_1fr_1fr] px-5 py-3.5 bg-blue50 font-extrabold text-[11px] text-muted tracking-wider uppercase border-b border-border">
                  <span>Centre</span>
                  <span>Area</span>
                  <span>NABL</span>
                  <span>ISO</span>
                  <span>Bookings</span>
                  <span>Verification</span>
                </div>
                <div className="divide-y divide-border">
                  {labsList.map((lab) => (
                    <div
                      key={lab._id}
                      data-testid={`admin-lab-row-${lab._id}`}
                      className="grid grid-cols-[1.6fr_1.2fr_0.8fr_0.8fr_1fr_1fr] px-5 py-4 items-center text-xs hover:bg-gray-50/70 transition"
                    >
                      <span className="font-bold text-ink">{lab.name}</span>
                      <span className="text-muted">{lab.area}</span>
                      <div>
                        <Chip variant={lab.accreditation?.nabl ? 'green' : 'red'}>
                          {lab.accreditation?.nabl ? 'Verified' : 'Missing'}
                        </Chip>
                      </div>
                      <div>
                        <Chip variant={lab.accreditation?.iso ? 'green' : 'amber'}>
                          {lab.accreditation?.iso ? 'Verified' : 'Pending'}
                        </Chip>
                      </div>
                      <span className="font-extrabold text-ink">{lab.bookingCount || 0}</span>
                      <div className="flex items-center gap-2">
                        <Chip variant={lab.isVerified ? 'green' : 'red'}>
                          {lab.isVerified ? 'Verified' : 'Unverified'}
                        </Chip>
                        <button
                          type="button"
                          onClick={() => handleToggleVerifyLab(lab._id, lab.isVerified)}
                          data-testid={`toggle-verify-lab-${lab._id}`}
                          className="text-[11px] font-bold text-blue600 hover:text-blue800 cursor-pointer"
                        >
                          {lab.isVerified ? 'Revoke' : 'Verify'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: RIDERS ================= */}
        {activeTab === 'riders' && (
          <div>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-ink">Riders</h1>
                <p className="text-sm text-muted mt-1">
                  Samples collected per phlebotomist.
                </p>
              </div>
              <Button
                variant="primary"
                size="small"
                className="shrink-0"
                data-testid="admin-add-rider"
                onClick={() => setCreating('rider')}
              >
                Add phlebotomist
              </Button>
            </div>

            {loadingRiders ? (
              <div className="p-12 text-center text-sm text-muted">Loading riders...</div>
            ) : ridersList.length === 0 ? (
              <EmptyState
                icon="scooter"
                title="No riders onboarded yet"
                description="Rider accounts are created from the operations console. Collection counts appear here once they start working."
              />
            ) : (
              <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm" data-testid="admin-riders-table">
                <div className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr_1fr] px-5 py-3.5 bg-blue50 font-extrabold text-[11px] text-muted tracking-wider uppercase border-b border-border">
                  <span>Rider Name</span>
                  <span>Lab Centre</span>
                  <span>Kit ID</span>
                  <span>Status</span>
                  <span>Samples Collected</span>
                </div>
                <div className="divide-y divide-border">
                  {ridersList.map((r) => (
                    <div
                      key={r._id}
                      data-testid={`admin-rider-row-${r._id}`}
                      className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr_1fr] px-5 py-4 items-center text-xs hover:bg-gray-50/70 transition"
                    >
                      <div>
                        <p className="font-bold text-ink">{r.userId?.name || 'Rider'}</p>
                        <p className="text-[11px] text-muted">+{r.userId?.phone || '—'}</p>
                      </div>
                      <span className="text-muted">{r.labCenterId?.name || 'PathCare Central'}</span>
                      <span className="font-mono text-ink">{r.kitId || 'KIT-01'}</span>
                      <div>
                        <Chip variant={r.status === 'available' ? 'green' : 'amber'}>
                          {r.status}
                        </Chip>
                      </div>
                      <span className="font-extrabold text-ink">{r.samplesCollected || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: DOCTORS ================= */}
        {activeTab === 'doctors' && (
          <div>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-ink">Partner Doctors</h1>
                <p className="text-sm text-muted mt-1">
                  Subscription is currently free for all tiers. PathCare takes no share of consultation fees.
                </p>
              </div>
              <Button
                variant="primary"
                size="small"
                className="shrink-0"
                data-testid="admin-add-doctor"
                onClick={() => setCreating('doctor')}
              >
                Add doctor
              </Button>
            </div>

            {loadingDoctors ? (
              <div className="p-12 text-center text-sm text-muted">Loading doctors...</div>
            ) : doctorsList.length === 0 ? (
              <EmptyState
                icon="stethoscope"
                title="No partner doctors yet"
                description="Doctors enrolled on PathCare appear here with their clinical specialities and patient referral counts."
              />
            ) : (
              <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm" data-testid="admin-doctors-table">
                <div className="grid grid-cols-[1.6fr_1.2fr_1fr_1fr_1.2fr] px-5 py-3.5 bg-blue50 font-extrabold text-[11px] text-muted tracking-wider uppercase border-b border-border">
                  <span>Doctor</span>
                  <span>Speciality</span>
                  <span>Plan</span>
                  <span>Patients Sent</span>
                  <span>Verification</span>
                </div>
                <div className="divide-y divide-border">
                  {doctorsList.map((d) => (
                    <div
                      key={d._id}
                      data-testid={`admin-doctor-row-${d._id}`}
                      className="grid grid-cols-[1.6fr_1.2fr_1fr_1fr_1.2fr] px-5 py-4 items-center text-xs hover:bg-gray-50/70 transition"
                    >
                      <div>
                        <p className="font-bold text-ink">{d.name}</p>
                        <p className="text-[11px] text-muted">{d.clinicName || 'Clinic'}</p>
                      </div>
                      <span className="text-muted">{d.specialization}</span>
                      <div>
                        <Chip variant={d.tier === 'Gold' ? 'amber' : 'grey'}>
                          {d.tier} · ₹0
                        </Chip>
                      </div>
                      <span className="font-extrabold text-ink">{d.referralCount || 0}</span>
                      <div className="flex items-center gap-2">
                        <Chip variant={d.isVerified ? 'green' : 'red'}>
                          {d.isVerified ? 'Verified' : 'Unverified'}
                        </Chip>
                        <button
                          type="button"
                          onClick={() => handleToggleVerifyDoctor(d._id, d.isVerified)}
                          data-testid={`toggle-verify-doctor-${d._id}`}
                          className="text-[11px] font-bold text-blue600 hover:text-blue800 cursor-pointer"
                        >
                          {d.isVerified ? 'Revoke' : 'Verify'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 6: REFERRAL LEADS ================= */}
        {activeTab === 'referrals' && (
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Referral Leads</h1>
            <p className="text-sm text-muted mt-1 mb-6">
              Doctors and hospitals patients named at booking who are not yet PathCare partners — ranked by how often they come up. This is the partner-recruitment pipeline.
            </p>

            {loadingLeads ? (
              <div className="p-12 text-center text-sm text-muted">Loading referral leads...</div>
            ) : leadsList.length === 0 ? (
              <EmptyState
                icon="search"
                title="No external referrals recorded yet"
                description="When a patient names a doctor or hospital that is not already a partner, they appear here as a recruitment lead."
              />
            ) : (
              <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm" data-testid="admin-leads-table">
                <div className="grid grid-cols-[60px_2.2fr_1fr_1.3fr_2fr] px-5 py-3.5 bg-blue50 font-extrabold text-[11px] text-muted tracking-wider uppercase border-b border-border">
                  <span>Rank</span>
                  <span>Doctor / Facility</span>
                  <span>Mentions</span>
                  <span>Pipeline Status</span>
                  <span>Recruitment Notes</span>
                </div>
                <div className="divide-y divide-border">
                  {leadsList.map((lead, idx) => (
                    <div
                      key={lead._id}
                      data-testid={`lead-row-${lead._id}`}
                      className="grid grid-cols-[60px_2.2fr_1fr_1.3fr_2fr] px-5 py-4 items-center text-xs hover:bg-gray-50/70 transition"
                    >
                      <span className="font-mono font-bold text-muted">#{idx + 1}</span>
                      <div>
                        <p className="font-bold text-ink text-sm">{lead.rawName || lead.normalizedName}</p>
                        <p className="text-[11px] text-muted truncate">Norm: {lead.normalizedName}</p>
                      </div>
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-extrabold bg-blue100 text-blue700">
                          {lead.mentionCount} {lead.mentionCount === 1 ? 'mention' : 'mentions'}
                        </span>
                      </div>
                      <div className="pr-2">
                        <select
                          value={lead.status}
                          onChange={(e) => handleUpdateLeadStatus(lead._id, e.target.value)}
                          data-testid={`lead-status-select-${lead._id}`}
                          className="w-full text-xs font-bold px-2 py-1 rounded-lg border border-border bg-white outline-none cursor-pointer"
                        >
                          <option value="New">New</option>
                          <option value="Contacted">Contacted</option>
                          <option value="In discussion">In discussion</option>
                          <option value="Converted">Converted</option>
                          <option value="Declined">Declined</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2 pr-2">
                        <p className="text-xs text-muted truncate max-w-[200px]">
                          {lead.notes || <span className="italic text-muted/60">No notes</span>}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNotesLead(lead);
                            setNotesDraft(lead.notes || '');
                          }}
                          className="text-[11px] font-bold text-blue600 hover:text-blue800 flex-shrink-0 cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 7: PATIENT FEEDBACK ================= */}
        {activeTab === 'feedback' && (
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Patient Feedback</h1>
            <p className="text-sm text-muted mt-1 mb-6">
              Collected after each booking. Includes interest in medicine pick-and-drop service.
            </p>

            {loadingFeedback ? (
              <div className="p-12 text-center text-sm text-muted">Loading feedback...</div>
            ) : feedbackList.length === 0 ? (
              <EmptyState
                icon="message"
                title="No feedback yet"
                description="Feedback submitted after a booking appears here, including interest in a medicine pick-and-drop service."
              />
            ) : (
              <div className="space-y-4" data-testid="admin-feedback-list">
                {feedbackList.map((f) => (
                  <Card key={f._id} className="p-5" data-testid={`feedback-card-${f._id}`}>
                    <p className="text-sm text-ink leading-relaxed mb-3">
                      {f.text ? f.text : <span className="italic text-muted">No written comment</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono bg-gray-100 text-ink font-bold px-2 py-0.5 rounded-md">
                        #{f.bookingId?._id ? f.bookingId._id.slice(-6).toUpperCase() : f.bookingId?.slice(-6).toUpperCase()}
                      </span>
                      {f.userId?.name && (
                        <span className="text-muted font-semibold">by {f.userId.name}</span>
                      )}
                      {f.pickAndDropInterest === 1 ? (
                        <Chip variant="green">Wants pick-and-drop</Chip>
                      ) : (
                        <Chip variant="grey">Not interested in pick-and-drop</Chip>
                      )}
                      {f.rating && (
                        <span className="text-amber-500 font-bold ml-auto">
                          {'★'.repeat(f.rating)}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Notes Modal for Referral Lead */}
      <Modal
        isOpen={Boolean(editingNotesLead)}
        onClose={() => setEditingNotesLead(null)}
        title={`Recruitment Notes — ${editingNotesLead?.rawName || editingNotesLead?.normalizedName}`}
        className="max-w-[500px]"
      >
        {editingNotesLead && (
          <div className="space-y-4">
            <p className="text-xs text-muted -mt-2">
              Mentioned by {editingNotesLead.mentionCount} patients · Status: <b>{editingNotesLead.status}</b>
            </p>
            <div>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Add outreach notes..."
                rows={4}
                className="w-full border border-border rounded-xl p-3 text-xs bg-white text-ink outline-none focus:border-blue600 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="small" onClick={() => setEditingNotesLead(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="small" onClick={handleSaveLeadNotes}>
                Save Notes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Creating centres and staff ──────────────────────────────────────
          One modal component, four configurations. None of them has a
          password field: the server generates it and returns it once, which
          is what IssuedCredentials below exists to show. */}

      <AdminCreateModal
        isOpen={creating === 'lab'}
        onClose={() => setCreating(null)}
        title="Add a lab centre"
        description="A new centre starts unverified and cannot receive bookings until you verify it."
        submitLabel="Create centre"
        onSubmit={createLabCentre}
        fields={[
          { name: 'name', label: 'Centre name', required: true, placeholder: 'Sunrise Diagnostics' },
          { name: 'area', label: 'Area', required: true, placeholder: 'Rajpur Road' },
          { name: 'address', label: 'Full address', required: true, placeholder: '12 Rajpur Road, Dehradun' },
          { name: 'lat', label: 'Latitude', type: 'number', required: true, placeholder: '30.3165' },
          {
            name: 'lng',
            label: 'Longitude',
            type: 'number',
            required: true,
            placeholder: '78.0322',
            help: 'Used to sort centres by distance from the patient.',
          },
          {
            name: 'priceMultiplier',
            label: 'Price multiplier',
            type: 'number',
            required: true,
            placeholder: '1.0',
            // This is the field on this form that can cost a patient money.
            help: 'Multiplies every test price at this centre. 1.0 is catalogue price; 1.15 is 15% above. Allowed range 0.5–2.0.',
          },
          { name: 'turnaroundHrs', label: 'Turnaround (hours)', type: 'number', placeholder: '24' },
          { name: 'nabl', label: 'NABL accredited', type: 'checkbox' },
          { name: 'iso', label: 'ISO accredited', type: 'checkbox' },
        ]}
      />

      <AdminCreateModal
        isOpen={creating === 'doctor'}
        onClose={() => setCreating(null)}
        title="Add a doctor"
        description="Creates their sign-in and their profile. They stay hidden from patients until you verify them."
        submitLabel="Create doctor"
        onSubmit={createDoctor}
        fields={[
          { name: 'name', label: 'Full name', required: true, placeholder: 'Dr A Mehta' },
          {
            name: 'accountHandle',
            label: 'Sign-in handle',
            required: true,
            placeholder: 'dr_mehta',
            help: 'Lowercase letters, numbers and underscores. This is what they type to sign in.',
          },
          { name: 'phone', label: 'Mobile number', required: true, placeholder: '9876543210' },
          { name: 'specialization', label: 'Specialisation', required: true, placeholder: 'Internal Medicine' },
          { name: 'clinicName', label: 'Clinic name', required: true, placeholder: 'City Diagnostics Clinic' },
          {
            name: 'clinicAddress',
            label: 'Clinic address',
            placeholder: '14 Civil Lines, Moradabad 244001',
            help: 'Where the patient actually goes. Left blank, the directory shows the clinic name alone — nothing is guessed.',
          },
          { name: 'consultationFee', label: 'Consultation fee (₹)', type: 'number', required: true, placeholder: '500' },
          {
            name: 'walkInFee',
            label: 'Walk-in fee (₹)',
            type: 'number',
            required: true,
            placeholder: '700',
            help: 'Paid by the patient directly to the clinic. PathCare takes no share.',
          },
          { name: 'qualification', label: 'Qualification', placeholder: 'MBBS, MD' },
        ]}
      />

      <AdminCreateModal
        isOpen={creating === 'rider'}
        onClose={() => setCreating(null)}
        title="Add a phlebotomist"
        description="Creates their sign-in for the rider app. They start offline and cannot be dispatched until they go on duty."
        submitLabel="Create phlebotomist"
        onSubmit={createRider}
        fields={[
          { name: 'name', label: 'Full name', required: true, placeholder: 'Arjun Mehta' },
          {
            name: 'accountHandle',
            label: 'Sign-in handle',
            required: true,
            placeholder: 'rider_arjun',
            help: 'Lowercase letters, numbers and underscores.',
          },
          { name: 'phone', label: 'Mobile number', required: true, placeholder: '9876543210' },
          {
            name: 'labCenterId',
            label: 'Home centre',
            type: 'select',
            required: true,
            options: labOptions,
            help: 'Where they hand samples in. Jobs at this centre are offered to them.',
          },
          { name: 'kitId', label: 'Kit ID', placeholder: 'KIT-004' },
        ]}
      />

      <AdminCreateModal
        isOpen={creating === 'labAdmin'}
        onClose={() => setCreating(null)}
        title="Add a lab desk login"
        description="A sign-in for the lab console, bound to one centre."
        submitLabel="Create login"
        onSubmit={createLabAdmin}
        fields={[
          { name: 'name', label: 'Desk or person name', required: true, placeholder: 'Sunrise Front Desk' },
          {
            name: 'accountHandle',
            label: 'Sign-in handle',
            required: true,
            placeholder: 'lab_sunrise',
            help: 'Lowercase letters, numbers and underscores.',
          },
          { name: 'phone', label: 'Mobile number', required: true, placeholder: '9876543210' },
          {
            name: 'labCenterId',
            label: 'Centre',
            type: 'select',
            required: true,
            options: labOptions,
            help: 'They will see this centre’s queue and nothing else.',
          },
        ]}
      />

      {issued && (
        <IssuedCredentials
          subject={issued.subject}
          credentials={issued.credentials}
          onClose={() => setIssued(null)}
        />
      )}
    </div>
  );
}

export default AdminConsolePage;

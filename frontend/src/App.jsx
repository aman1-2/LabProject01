import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import AuthPage from './pages/AuthPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import { CartProvider } from './context/CartContext.jsx';
import CataloguePage from './pages/CataloguePage.jsx';
import TestDetailsPage from './pages/TestDetailsPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import TrackingPage from './pages/TrackingPage.jsx';
import LabConsolePage from './pages/LabConsolePage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import DoctorDirectoryPage from './pages/DoctorDirectoryPage.jsx';
import DoctorProfilePage from './pages/DoctorProfilePage.jsx';
import DoctorDashboardPage from './pages/DoctorDashboardPage.jsx';
import PartnerApplyPage from './pages/PartnerApplyPage.jsx';
import AdminConsolePage from './pages/AdminConsolePage.jsx';
import { ProtectedRoute, RoleProtectedRoute } from './components/auth/ProtectedRoute.jsx';
import Navbar from './components/layout/Navbar.jsx';
import WhatsAppFab from './components/layout/WhatsAppFab.jsx';
import Card from './components/atoms/Card.jsx';
import Chip from './components/atoms/Chip.jsx';
import Button from './components/atoms/Button.jsx';
import EmptyState from './components/atoms/EmptyState.jsx';

function Dashboard() {
  const { user, api, logout } = useAuth();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadBookings() {
      try {
        const res = await api.get('/api/bookings');
        if (isMounted) {
          setBookings(res.data?.data || []);
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoadingBookings(false);
      }
    }

    loadBookings();
    return () => {
      isMounted = false;
    };
  }, [api]);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-10">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* User Profile Card */}
          <Card className="w-full md:w-[360px] p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-pill bg-blue100 text-blue700 flex items-center justify-center font-extrabold text-xl select-none">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <h2 className="text-cardTitle font-extrabold text-ink">
                  {user?.name || 'Patient'}
                </h2>
                <p className="text-caption text-muted font-medium">@{user?.accountHandle}</p>
                <div className="mt-1">
                  <Chip variant="green">Active Account</Chip>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-bodySmall py-4 border-t border-border">
              <div className="flex justify-between">
                <span className="text-muted">Mobile:</span>
                <span className="font-bold text-ink">+91 {user?.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Plan:</span>
                <span className="font-bold text-ink capitalize">{user?.accountType || 'Single'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">City:</span>
                <span className="font-bold text-ink">Dehradun</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Role:</span>
                <span className="font-bold text-ink capitalize">{user?.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Address:</span>
                <span className="font-bold text-ink truncate max-w-[180px]">
                  {user?.location?.address || 'Rajpur Road, Dehradun'}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border space-y-2">
              <Button
                variant="outline"
                size="small"
                className="w-full"
                onClick={() => navigate('/profile')}
                data-testid="dashboard-manage-family-btn"
              >
                Manage Family &amp; Profile →
              </Button>
              <Button variant="ghost" size="small" className="w-full" onClick={handleLogout}>
                Sign Out
              </Button>
            </div>
          </Card>

          {/* Activity Section */}
          <div className="flex-1 w-full space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-pageTitle font-extrabold text-ink">Test Bookings</h1>
                <p className="text-bodySmall text-muted mt-1">
                  View upcoming sample pickups and past clinical lab reports.
                </p>
              </div>
              <Button
                variant="primary"
                size="small"
                onClick={() => navigate('/tests')}
                data-testid="dashboard-book-btn"
              >
                + Book a test
              </Button>
            </div>

            {loadingBookings ? (
              <div className="p-8 text-center text-muted text-sm">Loading your bookings...</div>
            ) : bookings.length === 0 ? (
              <EmptyState
                icon="testTube"
                title="No bookings yet"
                body="Your booking history appears here once you book your first test."
                ctaText="Browse test catalogue"
                onCtaClick={() => navigate('/tests')}
              />
            ) : (
              <div className="space-y-4" data-testid="dashboard-bookings-list">
                {bookings.map((b) => {
                  const testName = b.testIds?.[0]?.name || b.packageId?.name || 'Diagnostic Test';
                  const labName = b.labCenterId?.name || 'Lab Partner';
                  const slotStr = b.slotDateTime
                    ? new Date(b.slotDateTime).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Scheduled Slot';

                  return (
                    <Card key={b._id} className="p-5 border border-border">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-extrabold text-ink text-base">{testName}</span>
                            <Chip variant={b.mode === 'home' ? 'green' : 'grey'}>
                              {b.mode === 'home' ? 'Home Collection' : 'Lab Visit'}
                            </Chip>
                            {b.status === 'awaiting_confirm' && (
                              <Chip variant="amber">Awaiting Lab Confirm</Chip>
                            )}
                            {b.status === 'pending' && <Chip variant="amber">Pending</Chip>}
                            {b.status === 'completed' && <Chip variant="green">Completed</Chip>}
                          </div>
                          <p className="text-xs text-muted">
                            {labName} · Slot: {slotStr}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-blue600 text-lg">₹{b.amount}</span>
                          <p className="text-[11px] text-muted">
                            {b.paymentMode?.toUpperCase()} · {b.paymentStatus}
                          </p>
                        </div>
                      </div>

                      {b.autoCancelAt && b.status === 'awaiting_confirm' && (
                        <div className="text-[11.5px] text-amberDark bg-amberBg px-3 py-1.5 rounded-md mb-3">
                          Auto-cancels if not confirmed by {new Date(b.autoCancelAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}

                      <div className="mt-3 pt-3 border-t border-border flex justify-end">
                        <Button
                          variant="outline"
                          size="small"
                          onClick={() => navigate(`/track/${b._id}`)}
                          data-testid={`track-booking-${b._id}`}
                        >
                          Track Live →
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Sends a staff member who has not chosen their own password to the form that
 * does it, from wherever they are.
 *
 * Putting this only in ProtectedRoute was not enough: after signing in they
 * land on "/", which is public, so the guard never ran and they saw the ordinary
 * home page with no hint that the server is refusing them everything else.
 *
 * Rendered inside the Router and above the routes, so it applies to public and
 * protected pages alike.
 */
function PasswordChangeGate({ children }) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (
    isAuthenticated &&
    user?.mustChangePassword &&
    location.pathname !== '/change-password'
  ) {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
      <PasswordChangeGate>
      <Routes>
        {/* Landing page. There was no "/" route at all before this: a
            visitor to the domain matched nothing and got a blank page. */}
        <Route path="/" element={<HomePage />} />

        {/* Reachable by anyone signed in. A staff member whose password was set
            by an admin is blocked from everything else until they use it, so it
            deliberately sits outside the role guards. */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />

        {/* Public Browsable Routes */}
        <Route path="/tests" element={<CataloguePage />} />
        <Route path="/tests/:slug" element={<TestDetailsPage />} />
        <Route path="/catalog" element={<CataloguePage />} />
        <Route path="/catalogue" element={<CataloguePage />} />
        <Route path="/doctors" element={<DoctorDirectoryPage />} />
        <Route path="/doctors/:id" element={<DoctorProfilePage />} />
        <Route path="/partner" element={<PartnerApplyPage />} />
        <Route path="/about" element={<PartnerApplyPage />} />

        {/* Doctor Console / Dashboard */}
        <Route
          path="/doctor/dashboard"
          element={
            <RoleProtectedRoute allowedRoles={['doctor', 'super_admin']}>
              <DoctorDashboardPage />
            </RoleProtectedRoute>
          }
        />

        {/* Auth Route */}
        <Route path="/auth" element={<AuthPage />} />

        {/* Protected Booking Route */}
        <Route
          path="/book"
          element={
            <ProtectedRoute>
              <BookingPage />
            </ProtectedRoute>
          }
        />

        {/* Protected Dashboard Route */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Protected Profile Route */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Real-time Tracking Routes */}
        <Route
          path="/track"
          element={
            <ProtectedRoute>
              <TrackingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/track/:bookingId"
          element={
            <ProtectedRoute>
              <TrackingPage />
            </ProtectedRoute>
          }
        />
        {/* Lab Centre Operational Console Route (Desktop Only) */}
        <Route
          path="/lab/console"
          element={
            <RoleProtectedRoute allowedRoles={['lab_admin', 'super_admin']}>
              <LabConsolePage />
            </RoleProtectedRoute>
          }
        />
        {/* Admin Console Routes (Desktop Only) matching prototype lines 936-994 */}
        <Route
          path="/admin"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="overview" />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/admin/overview"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="overview" />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/admin/bookings"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="bookings" />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/admin/labs"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="labs" />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/admin/riders"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="riders" />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/admin/doctors"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="doctors" />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/admin/referrals"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="referrals" />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/admin/referral-leads"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="referrals" />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="/admin/feedback"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <AdminConsolePage initialTab="feedback" />
            </RoleProtectedRoute>
          }
        />
      </Routes>
      </PasswordChangeGate>
      {/* Persistent WhatsApp FAB on all patient-facing pages per DESIGN_SPEC */}
      <WhatsAppFab />
      </CartProvider>
    </AuthProvider>
  );
}

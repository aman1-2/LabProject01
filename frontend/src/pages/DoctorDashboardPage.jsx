import React, { useState, useEffect } from 'react';
import Navbar from '../components/layout/Navbar.jsx';
import Card from '../components/atoms/Card.jsx';
import Chip from '../components/atoms/Chip.jsx';
import EmptyState from '../components/atoms/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';

import { CITY } from '../lib/locale.js';
export function DoctorDashboardPage() {
  const { user, api } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadDashboard() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/api/doctor/dashboard');
        if (isMounted && res.data?.success) {
          setDashboardData(res.data.data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || 'Unable to load doctor dashboard.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, [api]);

  const doctor = dashboardData?.doctor;
  const kpis = dashboardData?.kpis || dashboardData?.counts || {
    patientsReferred: 0,
    reportsReady: 0,
    appointments: 0,
  };
  const referredBookings = dashboardData?.referredBookings || [];
  const appointmentsList = dashboardData?.appointmentsList || [];

  // The linter surfaced that `loading` and `error` were set on every fetch but
  // never rendered, so this view showed a blank console while loading and gave
  // no feedback at all on failure. CONTEXT §9.4 requires loading, error and
  // empty states for every data view.
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-8">
          <div className="py-20 text-center text-muted font-semibold">
            Loading your dashboard...
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-8">
          <div className="max-w-lg mx-auto py-16">
            <EmptyState
              icon="warning"
              title="Dashboard unavailable"
              description={error}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-8">
        {/* Top Header Row matching prototype lines 836-838 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[25px] font-extrabold text-ink">
              {doctor?.name || user?.name || 'Doctor Console'}
            </h1>
            <p className="text-bodySmall text-muted mt-0.5">
              {doctor?.clinicName || 'PathCare Partner Clinic'} · {doctor?.specialization || 'Consultant Specialist'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Chip variant="amber" className="text-bodySmall px-3.5 py-1.5" data-testid="dashboard-tier-badge">
              Digital Front Desk · Free plan
            </Chip>
          </div>
        </div>

        {/* Strict Regulatory / NMC Compliance Note matching prototype line 840 */}
        <div
          className="card p-4 sm:p-5 mb-7 bg-blue50 border-none rounded-xl"
          data-testid="doctor-regulatory-notice"
        >
          <p className="text-bodySmall text-blue700 leading-relaxed font-medium">
            <span className="font-bold">PathCare takes no share of your consultation fee, and pays no referral commission.</span>{' '}
            Patients pay you directly at your clinic. The platform subscription is free while we build the {CITY} network.
          </p>
        </div>

        {/* 3 KPI Count Cards matching prototype lines 841-844 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8" data-testid="doctor-kpi-grid">
          {/* Card 1: Patients Sent For Testing */}
          <Card className="p-6">
            <p className="text-caption font-bold text-muted uppercase tracking-wider">
              PATIENTS SENT FOR TESTING
            </p>
            <p className="text-[32px] font-extrabold text-ink mt-1" data-testid="kpi-patients-referred">
              {kpis.patientsReferred}
            </p>
            <p className="text-caption text-muted2 mt-1">
              Patients who named you when booking
            </p>
          </Card>

          {/* Card 2: Reports Ready */}
          <Card className="p-6">
            <p className="text-caption font-bold text-muted uppercase tracking-wider">
              REPORTS READY
            </p>
            <p className="text-[32px] font-extrabold text-ink mt-1" data-testid="kpi-reports-ready">
              {kpis.reportsReady}
            </p>
            <p className="text-caption text-muted2 mt-1">
              Available for your review
            </p>
          </Card>

          {/* Card 3: Appointments Via PathCare */}
          <Card className="p-6">
            <p className="text-caption font-bold text-muted uppercase tracking-wider">
              APPOINTMENTS VIA PATHCARE
            </p>
            <p className="text-[32px] font-extrabold text-ink mt-1" data-testid="kpi-appointments">
              {kpis.appointments}
            </p>
            <p className="text-caption text-muted2 mt-1">
              Booked from your profile
            </p>
          </Card>
        </div>

        {/* Patients Referred List matching prototype lines 845-847 */}
        <Card className="p-6 mb-8" data-testid="referred-patients-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-extrabold text-[17px] text-ink">
              Patients referred by you
            </h2>
          </div>

          {referredBookings.length > 0 ? (
            <div className="divide-y divide-border">
              {referredBookings.map((b) => (
                <div
                  key={b._id}
                  className="py-3.5 flex items-center justify-between text-bodySmall"
                >
                  <span className="font-bold text-ink">{b.who}</span>
                  <span className="text-muted">{b.test}</span>
                  <Chip variant={b.status === 'report_ready' ? 'green' : 'blue'}>
                    {b.status === 'report_ready' ? 'Report ready' : 'In progress'}
                  </Chip>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="stethoscope"
              title="No patients yet"
              body="When a patient names you as their referring doctor at booking, they appear here with live status."
            />
          )}
        </Card>

        {/* Appointments List Section */}
        {appointmentsList.length > 0 && (
          <Card className="p-6" data-testid="appointments-list-card">
            <h2 className="font-extrabold text-[17px] text-ink mb-5">
              Consultation Appointments
            </h2>
            <div className="divide-y divide-border">
              {appointmentsList.map((appt) => (
                <div
                  key={appt._id}
                  className="py-3.5 flex items-center justify-between text-bodySmall"
                >
                  <div>
                    <span className="font-bold text-ink">
                      {appt.patientId?.name || 'Patient'}
                    </span>
                    <p className="text-caption text-muted">
                      Slot: {appt.slotLabel || new Date(appt.slotDateTime).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <Chip variant={appt.status === 'completed' ? 'green' : 'blue'}>
                      {appt.status}
                    </Chip>
                    <p className="text-caption text-blue700 mt-1">Direct pay at clinic</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

export default DoctorDashboardPage;

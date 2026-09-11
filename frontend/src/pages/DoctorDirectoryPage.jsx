import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar.jsx';
import Card from '../components/atoms/Card.jsx';
import Chip from '../components/atoms/Chip.jsx';
import Button from '../components/atoms/Button.jsx';
import EmptyState from '../components/atoms/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/atoms/Icon.jsx';

// Generate consistent avatar background color from name per prototype col()
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

// Generate initials from name per prototype ini()
function getInitials(name = '') {
  const parts = name.replace(/^Dr\.\s*/i, '').trim().split(/\s+/);
  if (!parts[0]) return 'DR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function DoctorDirectoryPage() {
  const navigate = useNavigate();
  const { api } = useAuth();

  const [doctors, setDoctors] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch specialties
  useEffect(() => {
    let isMounted = true;
    async function loadSpecialties() {
      try {
        const res = await api.get('/api/doctors/specialties');
        if (isMounted && res.data?.success) {
          setSpecialties(res.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load specialties:', err);
      }
    }
    loadSpecialties();
    return () => {
      isMounted = false;
    };
  }, [api]);

  // Fetch doctors filtered by specialty
  useEffect(() => {
    let isMounted = true;
    async function loadDoctors() {
      setLoading(true);
      setError(null);
      try {
        const params = selectedSpecialty !== 'all' ? { specialty: selectedSpecialty } : {};
        const res = await api.get('/api/doctors', { params });
        if (isMounted && res.data?.success) {
          setDoctors(res.data.data || []);
        }
      } catch (err) {
        if (isMounted) {
          setError('Unable to load doctors. Please try again later.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadDoctors();
    return () => {
      isMounted = false;
    };
  }, [api, selectedSpecialty]);

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1240px] w-full mx-auto px-7 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-[28px] font-extrabold text-ink mb-2">Find a Doctor</h1>
          <p className="text-body text-muted leading-relaxed max-w-[700px]">
            Consult verified specialists across Dehradun. Pay directly at the clinic — zero booking fees, no commission.
          </p>
        </div>

        {/* Regulatory Disclosure Banner per CONTEXT §2.2 */}
        <div className="card p-4 mb-6 bg-blue50 border-none rounded-xl">
          <p className="text-bodySmall text-blue700 leading-relaxed">
            <span className="font-bold">Transparent Care:</span> PathCare takes zero commission and no share of consultation fees. You pay the doctor directly at their clinic.
          </p>
        </div>

        {/* Specialty Filter Chips per prototype lines 713-714 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-8 no-scrollbar" data-testid="specialty-chips">
          <button
            type="button"
            onClick={() => setSelectedSpecialty('all')}
            className={`px-4 py-2 rounded-pill font-bold text-caption transition-all cursor-pointer select-none ${
              selectedSpecialty === 'all'
                ? 'bg-blue600 text-white shadow-sm'
                : 'bg-chipGreyBg text-muted hover:text-ink'
            }`}
          >
            All specialities
          </button>
          {specialties.map((spec) => (
            <button
              key={spec}
              type="button"
              onClick={() => setSelectedSpecialty(spec)}
              className={`px-4 py-2 rounded-pill font-bold text-caption transition-all cursor-pointer whitespace-nowrap select-none ${
                selectedSpecialty === spec
                  ? 'bg-blue600 text-white shadow-sm'
                  : 'bg-chipGreyBg text-muted hover:text-ink'
              }`}
            >
              {spec}
            </button>
          ))}
        </div>

        {/* Doctor Grid or Loading / Empty states */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 bg-white rounded-xl border border-border" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon="alert"
            title="Unable to load doctors"
            body={error}
            ctaText="Try again"
            onCtaClick={() => setSelectedSpecialty('all')}
          />
        ) : doctors.length === 0 ? (
          <EmptyState
            icon="search"
            title="No doctors in this speciality yet"
            body="We are onboarding partner doctors across Dehradun."
            ctaText="See all"
            onCtaClick={() => setSelectedSpecialty('all')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="doctor-grid">
            {doctors.map((doc) => {
              const bgCol = getAvatarColor(doc.name);
              const initials = getInitials(doc.name);
              const isFeatured = doc.isFeatured || doc.tier === 'Gold';

              return (
                <Card
                  key={doc._id}
                  interactive
                  onClick={() => navigate(`/doctors/${doc._id}`)}
                  className="p-6 cursor-pointer flex flex-col justify-between"
                  data-testid={`doctor-card-${doc._id}`}
                >
                  <div>
                    {/* Top Row: Avatar + Name + Qualification */}
                    <div className="flex items-center gap-3.5 mb-3.5">
                      <div
                        className="w-[52px] h-[52px] rounded-pill text-white flex items-center justify-center font-bold text-base flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: bgCol }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-extrabold text-[16px] text-ink truncate">
                          {doc.name}
                        </h2>
                        <p className="text-caption text-muted truncate">
                          {doc.qualification || 'MBBS'}
                        </p>
                      </div>
                    </div>

                    {/* Chips: Speciality + Featured Partner Badge */}
                    <div className="flex flex-wrap items-center gap-2 mb-3.5">
                      <Chip variant="blue">{doc.specialization}</Chip>
                      {isFeatured && (
                        <Chip variant="amber" data-testid="featured-partner-badge">
                          Featured partner
                        </Chip>
                      )}
                    </div>

                    {/* Clinic Address & Experience */}
                    <p className="text-bodySmall text-muted mb-1.5 flex items-center gap-1.5 truncate">
                      <Icon name="mapPin" size={16} className="inline-block shrink-0" /> {doc.clinicAddress || doc.clinicName}
                    </p>
                    <p className="text-bodySmall text-muted mb-4">
                      {doc.experienceYears ? `${doc.experienceYears} years experience` : 'Experienced specialist'}
                    </p>
                  </div>

                  {/* Footer Row: Pricing & CTA */}
                  <div className="flex items-center justify-between pt-3.5 border-t border-border mt-2">
                    <div>
                      <p className="font-extrabold text-ink text-[16px]">
                        ₹{doc.consultationFee}
                      </p>
                      {doc.walkInFee > doc.consultationFee && (
                        <p className="text-caption text-muted2 line-through">
                          ₹{doc.walkInFee} walk-in
                        </p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/doctors/${doc._id}`);
                      }}
                    >
                      View profile
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default DoctorDirectoryPage;

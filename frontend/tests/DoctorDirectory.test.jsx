import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuthContext from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import DoctorDirectoryPage from '../src/pages/DoctorDirectoryPage.jsx';
import DoctorProfilePage from '../src/pages/DoctorProfilePage.jsx';
import DoctorDashboardPage from '../src/pages/DoctorDashboardPage.jsx';
import PartnerApplyPage from '../src/pages/PartnerApplyPage.jsx';

describe('Doctor Network, Consultations & Partner Application Tests', () => {
  let mockApi;
  let mockUser;
  let mockDoctors;
  let mockDoctorProfile;

  beforeEach(() => {
    mockUser = {
      _id: 'user_patient_123',
      name: 'Rohan Sharma',
      accountHandle: 'rohan.s',
      role: 'patient',
    };

    mockDoctors = [
      {
        _id: 'doc_gold_1',
        name: 'Dr. Sunita Sharma',
        qualification: 'MBBS, MD (Cardiology)',
        specialization: 'Cardiology',
        clinicName: 'Heart Care Clinic',
        clinicAddress: '42 MG Road, Indiranagar, Bangalore',
        consultationFee: 700,
        walkInFee: 800,
        experienceYears: 14,
        tier: 'Gold',
        isFeatured: true,
      },
      {
        _id: 'doc_starter_2',
        name: 'Dr. Aaron Patel',
        qualification: 'MBBS, DNB (Cardiology)',
        specialization: 'Cardiology',
        clinicName: 'Patel Heart Center',
        clinicAddress: '15 Brigade Road, Bangalore',
        consultationFee: 500,
        walkInFee: 600,
        experienceYears: 6,
        tier: 'Starter',
        isFeatured: false,
      },
      {
        _id: 'doc_gold_derma',
        name: 'Dr. Catherine Roy',
        qualification: 'MBBS, MD (Dermatology)',
        specialization: 'Dermatology',
        clinicName: 'Roy Skin Clinic',
        clinicAddress: '88 Koramangala, Bangalore',
        consultationFee: 900,
        walkInFee: 1000,
        experienceYears: 11,
        tier: 'Gold',
        isFeatured: true,
      },
    ];

    mockDoctorProfile = {
      _id: 'doc_gold_1',
      name: 'Dr. Sunita Sharma',
      qualification: 'MBBS, MD (Cardiology)',
      specialization: 'Cardiology',
      clinicName: 'Heart Care Clinic',
      clinicAddress: '42 MG Road, Indiranagar, Bangalore',
      consultationHours: 'Mon–Sat, 10:00 AM – 8:00 PM',
      consultationFee: 700,
      walkInFee: 800,
      experienceYears: 14,
      tier: 'Gold',
      isFeatured: true,
      about: 'Senior interventional cardiologist with over 14 years of clinical experience.',
    };

    mockApi = {
      get: vi.fn(async (url, config) => {
        if (url === '/api/doctors/specialties') {
          return { data: { success: true, data: ['Cardiology', 'Dermatology'] } };
        }
        if (url === '/api/doctors') {
          const spec = config?.params?.specialty;
          const filtered = spec && spec !== 'all'
            ? mockDoctors.filter((d) => d.specialization === spec)
            : mockDoctors;
          return { data: { success: true, data: filtered } };
        }
        if (url === '/api/doctors/doc_gold_1') {
          return { data: { success: true, data: mockDoctorProfile } };
        }
        if (url === '/api/doctor/dashboard' || url === '/api/doctors/dashboard') {
          return {
            data: {
              success: true,
              data: {
                doctor: {
                  _id: 'doc_gold_1',
                  name: 'Dr. Sunita Sharma',
                  specialization: 'Cardiology',
                  clinicName: 'Heart Care Clinic',
                  tier: 'Gold',
                },
                kpis: {
                  patientsReferred: 12,
                  reportsReady: 8,
                  appointments: 5,
                },
                regulatoryNotice:
                  'PathCare takes no share of your consultation fee, and pays no referral commission. Never. Patients pay you directly at your clinic.',
                referredBookings: [
                  {
                    _id: 'b1',
                    who: 'Aarav Gupta',
                    test: 'Complete Blood Count (CBC)',
                    status: 'report_ready',
                  },
                ],
                appointmentsList: [],
              },
            },
          };
        }
        return { data: { success: true, data: [] } };
      }),
      post: vi.fn(async (url, body) => {
        if (url === '/api/appointments') {
          return {
            data: {
              success: true,
              data: {
                _id: 'appt_123',
                doctorId: body.doctorId,
                patientId: mockUser._id,
                slotDateTime: body.slotDateTime,
                slotLabel: body.slotLabel,
                status: 'booked',
              },
              doctor: {
                name: 'Dr. Sunita Sharma',
                consultationFee: 700,
              },
              directPaymentNotice:
                'Pay the doctor directly at the clinic. PathCare charges no booking fee and takes no share of the consultation.',
            },
          };
        }
        if (url === '/api/partner/apply') {
          return {
            data: {
              success: true,
              data: {
                _id: 'app_123',
                type: body.type,
                status: 'received',
                callbackPromise:
                  'Our partnerships team will call you within 2 working days to verify your details.',
              },
            },
          };
        }
        return { data: { success: true } };
      }),
    };
  });

  function renderWithAuth(ui, initialEntries = ['/']) {
    return render(
      <AuthContext.Provider
        value={{
          user: mockUser,
          api: mockApi,
          logout: vi.fn(),
          isAuthenticated: true,
          isLoading: false,
        }}
      >
          <CartProvider>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </CartProvider>
        </AuthContext.Provider>
    );
  }

  describe('Doctor Directory Page', () => {
    it('renders doctor directory, specialty chips, and gold Featured partner badge', async () => {
      renderWithAuth(<DoctorDirectoryPage />);

      // Verify Header and Regulatory Disclosure
      expect(screen.getByText('Find a Doctor')).toBeInTheDocument();
      expect(
        screen.getByText(/PathCare takes zero commission and no share of consultation fees/i)
      ).toBeInTheDocument();

      // Wait for doctors to load
      await waitFor(() => {
        expect(screen.getByText('Dr. Sunita Sharma')).toBeInTheDocument();
        expect(screen.getByText('Dr. Aaron Patel')).toBeInTheDocument();
      });

      // Verify Featured partner amber badge appears on Gold doctor
      const featuredBadges = screen.getAllByText('Featured partner');
      expect(featuredBadges.length).toBeGreaterThan(0);

      // Verify fee comparison
      expect(screen.getByText('₹700')).toBeInTheDocument();
      expect(screen.getByText(/₹800 walk-in/i)).toBeInTheDocument();
    });

    it('filters doctors by specialty when filter chip is clicked', async () => {
      renderWithAuth(<DoctorDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cardiology' })).toBeInTheDocument();
      });

      // Click Dermatology filter chip
      const dermaChip = screen.getByRole('button', { name: 'Dermatology' });
      fireEvent.click(dermaChip);

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          '/api/doctors',
          expect.objectContaining({ params: { specialty: 'Dermatology' } })
        );
      });
    });
  });

  describe('Doctor Profile & Zero-Payment Consultation Booking', () => {
    it('renders doctor details, direct-pay notice, and books appointment with zero payment', async () => {
      renderWithAuth(
        <Routes>
          <Route path="/doctors/:id" element={<DoctorProfilePage />} />
        </Routes>,
        ['/doctors/doc_gold_1']
      );

      await waitFor(() => {
        expect(screen.getByText('Dr. Sunita Sharma')).toBeInTheDocument();
        expect(screen.getByText('Heart Care Clinic')).toBeInTheDocument();
      });

      // Strict Regulatory Copy: Direct Pay at Clinic
      expect(
        screen.getByText(/You pay the doctor directly at the clinic/i)
      ).toBeInTheDocument();

      // Pick a slot
      const slotBtn = screen.getByTestId('slot-10:00 AM');
      fireEvent.click(slotBtn);

      // Confirm appointment
      const confirmBtn = screen.getByTestId('confirm-appointment-button');
      fireEvent.click(confirmBtn);

      // Wait for appointment success modal
      await waitFor(() => {
        expect(screen.getByTestId('appointment-success-modal')).toBeInTheDocument();
        expect(screen.getByText(/Pay directly at the clinic/i)).toBeInTheDocument();
      });

      // Verify API was called with slot and NO payment records
      expect(mockApi.post).toHaveBeenCalledWith('/api/appointments', expect.objectContaining({
        doctorId: 'doc_gold_1',
        slotLabel: '10:00 AM',
      }));
    });
  });

  describe('Doctor Dashboard (Operational Counts Only, Zero Money)', () => {
    it('displays 3 count KPI cards and explicit NMC regulatory disclaimer', async () => {
      renderWithAuth(<DoctorDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('PATIENTS SENT FOR TESTING')).toBeInTheDocument();
        expect(screen.getByText('REPORTS READY')).toBeInTheDocument();
        expect(screen.getByText('APPOINTMENTS VIA PATHCARE')).toBeInTheDocument();
      });

      // Check count values
      expect(screen.getByTestId('kpi-patients-referred')).toHaveTextContent('12');
      expect(screen.getByTestId('kpi-reports-ready')).toHaveTextContent('8');
      expect(screen.getByTestId('kpi-appointments')).toHaveTextContent('5');

      // Check NMC Compliance Disclaimer
      expect(screen.getByTestId('doctor-regulatory-notice')).toHaveTextContent(
        /PathCare takes no share of your consultation fee, and pays no referral commission/i
      );

      // Verify NO monetary metrics anywhere on the page (zero earnings, zero payout, zero balance)
      expect(screen.queryByText(/earnings/i)).toBeNull();
      expect(screen.queryByText(/payout/i)).toBeNull();
      expect(screen.queryByText(/balance/i)).toBeNull();
      expect(screen.queryByText(/revenue/i)).toBeNull();
    });
  });

  describe('Partner Application Portal', () => {
    it('toggles partner type and submits application with callback promise', async () => {
      renderWithAuth(<PartnerApplyPage />);

      expect(screen.getByText('Partner with PathCare')).toBeInTheDocument();

      // Check Doctor vs Lab toggle
      const labBtn = screen.getByTestId('partner-type-lab');
      fireEvent.click(labBtn);

      // Fill in form
      fireEvent.change(screen.getByPlaceholderText('Full name'), {
        target: { value: 'Apex Diagnostic Lab' },
      });
      fireEvent.change(screen.getByPlaceholderText('Laboratory name'), {
        target: { value: 'Apex Diagnostics' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Speciality or services offered/i), {
        target: { value: 'Biochemistry, Haematology' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Area in Dehradun/i), {
        target: { value: 'Rajpur Road' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Mobile number/i), {
        target: { value: '9812345678' },
      });

      // Submit form
      const submitBtn = screen.getByTestId('partner-submit-button');
      fireEvent.click(submitBtn);

      // Expect success view with 2 working days callback notice
      await waitFor(() => {
        expect(screen.getByTestId('partner-success-card')).toBeInTheDocument();
        expect(screen.getByText('Application received')).toBeInTheDocument();
        expect(screen.getByText(/within two working days/i)).toBeInTheDocument();
      });
    });
  });
});

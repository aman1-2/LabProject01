// frontend/tests/AdminConsole.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminConsolePage from '../src/pages/AdminConsolePage.jsx';
import AuthContext from '../src/context/AuthContext.jsx';

describe('AdminConsolePage Component Tests (Desktop Only)', () => {
  let mockApi;
  let mockUser;

  beforeEach(() => {
    mockUser = {
      _id: 'user_super_admin_1',
      name: 'Super Admin',
      accountHandle: 'super.admin',
      role: 'super_admin',
    };

    mockApi = {
      get: vi.fn(async (url) => {
        if (url === '/api/admin/overview') {
          return {
            data: {
              success: true,
              data: {
                today: {
                  bookingsCount: 0,
                  revenue: 0,
                  revenuePending: 0,
                  reportsDelivered: 0,
                  modeSplit: { home: 0, visit: 0 },
                  paymentSplit: { upi: 0, cash: 0 },
                  perLabVolumes: [],
                },
                historical: [],
              },
            },
          };
        }
        if (url === '/api/admin/bookings') {
          return { data: { success: true, data: { bookings: [], total: 0 } } };
        }
        if (url === '/api/admin/labs') {
          return {
            data: {
              success: true,
              data: [
                {
                  _id: 'lab_1',
                  name: 'PathCare Central Lab',
                  area: 'Clock Tower',
                  accreditation: { nabl: true, iso: true },
                  isVerified: true,
                  bookingCount: 15,
                },
                {
                  _id: 'lab_2',
                  name: 'Doon Diagnostics',
                  area: 'Ballupur Chowk',
                  accreditation: { nabl: false, iso: false },
                  isVerified: false,
                  bookingCount: 0,
                },
              ],
            },
          };
        }
        if (url === '/api/admin/riders') {
          return {
            data: {
              success: true,
              data: [
                {
                  _id: 'rider_1',
                  userId: { name: 'Rider Ramesh', phone: '9876543201' },
                  labCenterId: { name: 'PathCare Central' },
                  kitId: 'KIT-01',
                  status: 'available',
                  samplesCollected: 8,
                },
              ],
            },
          };
        }
        if (url === '/api/admin/doctors') {
          return {
            data: {
              success: true,
              data: [
                {
                  _id: 'doc_1',
                  name: 'Dr. Vivek Bhatt',
                  clinicName: 'Doon Heart Institute',
                  specialization: 'Cardiology',
                  tier: 'Gold',
                  isVerified: false,
                  referralCount: 12,
                },
              ],
            },
          };
        }
        if (url === '/api/admin/referral-leads') {
          return { data: { success: true, data: [] } };
        }
        if (url === '/api/admin/feedback') {
          return {
            data: {
              success: true,
              data: [
                {
                  _id: 'fb_1',
                  bookingId: { _id: '6a9b91a1b2c3d4e5f6000001' },
                  userId: { name: 'Ananya Roy' },
                  text: 'Phlebotomist was gentle and cold chain was verified.',
                  pickAndDropInterest: 1,
                  rating: 5,
                },
              ],
            },
          };
        }
        return { data: { success: true, data: [] } };
      }),
      patch: vi.fn(async (url, body) => {
        return { data: { success: true, data: { ...body } } };
      }),
    };
  });

  function renderComponent(initialTab = 'overview') {
    return render(
      <AuthContext.Provider
        value={{
          user: mockUser,
          api: mockApi,
          logout: vi.fn(),
        }}
      >
        <MemoryRouter>
          <AdminConsolePage initialTab={initialTab} />
        </MemoryRouter>
      </AuthContext.Provider>
    );
  }

  it('renders dashboard at zero gracefully with zero banner and 0 counts', async () => {
    renderComponent('overview');

    await waitFor(() => {
      expect(screen.getByText('Business Overview')).toBeInTheDocument();
    });

    // Verify 4 KPI cards show 0
    expect(screen.getByTestId('kpi-bookings-today')).toHaveTextContent('0');
    expect(screen.getByTestId('kpi-revenue-collected')).toHaveTextContent('₹0');
    expect(screen.getByTestId('kpi-payment-pending')).toHaveTextContent('₹0');
    expect(screen.getByTestId('kpi-reports-delivered')).toHaveTextContent('0');

    // Verify zero banner
    expect(screen.getByTestId('overview-zero-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/These figures populate from real bookings. Make a booking in the patient flow to see them move./i)
    ).toBeInTheDocument();
  });

  it('renders dashboard with live figures when activity exists', async () => {
    mockApi.get = vi.fn(async (url) => {
      if (url === '/api/admin/overview') {
        return {
          data: {
            success: true,
            data: {
              today: {
                bookingsCount: 3,
                revenue: 1500,
                revenuePending: 500,
                reportsDelivered: 1,
                modeSplit: { home: 2, visit: 1 },
                paymentSplit: { upi: 2, cash: 1 },
                perLabVolumes: [{ labId: 'lab_1', labName: 'PathCare Central', count: 3 }],
              },
              historical: [],
            },
          },
        };
      }
      return { data: { success: true, data: [] } };
    });

    renderComponent('overview');

    await waitFor(() => {
      expect(screen.getByTestId('kpi-bookings-today')).toHaveTextContent('3');
    });

    expect(screen.getByTestId('kpi-revenue-collected')).toHaveTextContent('₹1,500');
    expect(screen.getByTestId('kpi-payment-pending')).toHaveTextContent('₹500');
    expect(screen.getByTestId('kpi-reports-delivered')).toHaveTextContent('1');
    expect(screen.queryByTestId('overview-zero-banner')).not.toBeInTheDocument();
  });

  it('navigates between all 7 tabs seamlessly', async () => {
    renderComponent('overview');

    await waitFor(() => {
      expect(screen.getByText('Business Overview')).toBeInTheDocument();
    });

    // 1. Bookings Tab
    fireEvent.click(screen.getByTestId('tab-bookings'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'All Bookings' })).toBeInTheDocument();
    });

    // 2. Lab Centres Tab
    fireEvent.click(screen.getByTestId('tab-labs'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Lab Centres' })).toBeInTheDocument();
    });
    expect(screen.getByText('PathCare Central Lab')).toBeInTheDocument();
    expect(screen.getByText('Doon Diagnostics')).toBeInTheDocument();

    // 3. Riders Tab
    fireEvent.click(screen.getByTestId('tab-riders'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Riders' })).toBeInTheDocument();
    });
    expect(screen.getByText('Rider Ramesh')).toBeInTheDocument();

    // 4. Doctors Tab
    fireEvent.click(screen.getByTestId('tab-doctors'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Partner Doctors' })).toBeInTheDocument();
    });
    expect(screen.getByText('Dr. Vivek Bhatt')).toBeInTheDocument();

    // 5. Referral Leads Tab
    fireEvent.click(screen.getByTestId('tab-referrals'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Referral Leads' })).toBeInTheDocument();
    });

    // 6. Feedback Tab
    fireEvent.click(screen.getByTestId('tab-feedback'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Patient Feedback' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Phlebotomist was gentle/i)).toBeInTheDocument();
    expect(screen.getByText('Wants pick-and-drop')).toBeInTheDocument();
  });

  it('toggles lab verification via button', async () => {
    renderComponent('labs');

    await waitFor(() => {
      expect(screen.getByTestId('toggle-verify-lab-lab_2')).toBeInTheDocument();
    });

    // Unverified lab button says "Verify"
    const verifyBtn = screen.getByTestId('toggle-verify-lab-lab_2');
    expect(verifyBtn).toHaveTextContent('Verify');

    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith('/api/admin/labs/lab_2/verify', { isVerified: true });
    });
  });

  it('toggles doctor verification via button', async () => {
    renderComponent('doctors');

    await waitFor(() => {
      expect(screen.getByTestId('toggle-verify-doctor-doc_1')).toBeInTheDocument();
    });

    const verifyBtn = screen.getByTestId('toggle-verify-doctor-doc_1');
    expect(verifyBtn).toHaveTextContent('Verify');

    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith('/api/admin/doctors/doc_1/verify', { isVerified: true });
    });
  });
});

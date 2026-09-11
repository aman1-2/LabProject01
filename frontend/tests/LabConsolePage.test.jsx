// frontend/tests/LabConsolePage.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import LabConsolePage from '../src/pages/LabConsolePage.jsx';
import AuthContext from '../src/context/AuthContext.jsx';

describe('LabConsolePage Component Tests (Desktop Only)', () => {
  let mockApi;
  let mockUser;
  let mockBookings;
  let mockProfile;
  let mockDoctors;

  beforeEach(() => {
    mockUser = {
      _id: 'user_lab_admin_1',
      name: 'Dr. Ramesh Kumar',
      accountHandle: 'sunrise.admin',
      role: 'lab_admin',
      labCenterId: 'lab_sunrise_1',
    };

    mockProfile = {
      _id: 'lab_sunrise_1',
      name: 'Sunrise Diagnostics',
      area: 'Rajpur Road, Dehradun',
      accreditation: { nabl: true, iso: true },
      turnaroundHrs: 6,
      isVerified: true,
    };

    mockDoctors = [
      {
        _id: 'doc_1',
        name: 'Dr. Sanjay Kapoor',
        specialization: 'Pathologist',
        clinicName: 'Doon Clinic',
      },
    ];

    mockBookings = [
      {
        _id: 'book_awaiting_123',
        patientId: { name: 'Aarav Sharma' },
        testIds: [{ name: 'Complete Blood Count (CBC)' }],
        mode: 'visit',
        slotDateTime: new Date().toISOString(),
        status: 'awaiting_confirm',
        paymentMode: 'cash',
        paymentStatus: 'pending',
        amount: 350,
        nearAutoCancel: true,
        autoCancelHoursLeft: 1.5,
      },
      {
        _id: 'book_at_lab_456',
        patientId: { name: 'Priya Singh' },
        testIds: [{ name: 'Lipid Profile' }],
        mode: 'home',
        slotDateTime: new Date().toISOString(),
        status: 'at_lab',
        paymentMode: 'upi',
        paymentStatus: 'paid',
        amount: 600,
        barcode: 'PC-260904-89ABCD-01',
      },
    ];

    mockApi = {
      get: vi.fn(async (url) => {
        if (url === '/api/lab/queue') {
          return { data: { success: true, data: mockBookings } };
        }
        if (url === '/api/lab/profile') {
          return { data: { success: true, data: mockProfile } };
        }
        if (url === '/api/doctors') {
          return { data: { success: true, data: mockDoctors } };
        }
        return { data: { success: true, data: [] } };
      }),
      patch: vi.fn(async () => {
        return { data: { success: true, message: 'Confirmed' } };
      }),
      post: vi.fn(async () => {
        return { data: { success: true, message: 'Processed' } };
      }),
    };
  });

  function renderComponent() {
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
        <MemoryRouter>
          <LabConsolePage />
        </MemoryRouter>
      </AuthContext.Provider>
    );
  }

  it('renders sidebar navigation with all 4 tabs and centre name', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('tab-booking-queue')).toBeInTheDocument();
      expect(screen.getByTestId('tab-upload-reports')).toBeInTheDocument();
      expect(screen.getByTestId('tab-cash-payments')).toBeInTheDocument();
      expect(screen.getByTestId('tab-centre-profile')).toBeInTheDocument();
      expect(screen.getByText('Sunrise Diagnostics')).toBeInTheDocument();
    });
  });

  it('renders booking queue with action items and near auto-cancel alert', async () => {
    renderComponent();

    await waitFor(() => {
      // Header and alert banner
      expect(screen.getByRole('heading', { name: /Booking Queue/i })).toBeInTheDocument();
      expect(screen.getByTestId('awaiting-confirmation-banner')).toBeInTheDocument();

      // Row items
      expect(screen.getByText(/Aarav Sharma/)).toBeInTheDocument();
      expect(screen.getByText(/Complete Blood Count/)).toBeInTheDocument();

      // Near auto-cancel badge
      expect(screen.getByTestId('near-autocancel-badge')).toHaveTextContent('Auto-cancels in 1.5h');

      // Confirm arrival action button
      expect(screen.getByTestId('confirm-btn-book_awaiting_123')).toBeInTheDocument();
    });

    // Clicking confirm button triggers PATCH /api/lab/bookings/:id/confirm
    fireEvent.click(screen.getByTestId('confirm-btn-book_awaiting_123'));
    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith('/api/lab/bookings/book_awaiting_123/confirm');
    });
  });

  it('switches to Cash Payments tab and handles marking cash as received', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('tab-cash-payments')).toBeInTheDocument();
    });

    // Switch to Cash tab
    fireEvent.click(screen.getByTestId('tab-cash-payments'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Cash Payments/i })).toBeInTheDocument();
      expect(screen.getByTestId('mark-received-btn-book_awaiting_123')).toBeInTheDocument();
    });

    // Mark cash received
    fireEvent.click(screen.getByTestId('mark-received-btn-book_awaiting_123'));
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/lab/bookings/book_awaiting_123/cash-received');
    });
  });

  it('switches to Centre Profile tab and displays read-only accreditation details', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('tab-centre-profile')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-centre-profile'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Centre Profile/i })).toBeInTheDocument();
      expect(screen.getByText('NABL Accreditation')).toBeInTheDocument();
      expect(screen.getByText('ISO 9001:2015')).toBeInTheDocument();
      expect(screen.getByText(/6 hours/)).toBeInTheDocument();
    });
  });
});

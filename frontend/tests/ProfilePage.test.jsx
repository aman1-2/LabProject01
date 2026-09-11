import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfilePage from '../src/pages/ProfilePage.jsx';
import AuthContext from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';

/**
 * The Subscriptions tab reads from the real API module. Stubbing it at the
 * boundary keeps these tests about the PAGE — its tabs, its empty states —
 * rather than about network behaviour, and lets each test choose what the
 * server returned.
 */
vi.mock('@pathcare/api', async () => {
  const actual = await vi.importActual('@pathcare/api');
  return {
    ...actual,
    fetchSubscriptions: vi.fn(async () => ({ items: [] })),
    pauseSubscription: vi.fn(async () => ({})),
    resumeSubscription: vi.fn(async () => ({})),
    cancelSubscription: vi.fn(async () => ({})),
  };
});

describe('ProfilePage 6-Tab & Account Management Component Tests', () => {
  let mockApi;
  let mockUser;
  let mockMembers;
  let mockAddresses;
  let mockBookings;
  let mockSubscriptions;
  let mockUpdateUser;

  beforeEach(() => {
    mockUser = {
      _id: 'user_alpha_1',
      name: 'Aarav Sharma',
      accountHandle: 'aarav.sharma',
      phone: '9876543210',
      accountType: 'single',
      role: 'patient',
      location: { address: 'Rajpur Road, Dehradun' },
    };

    mockMembers = [];
    mockAddresses = [];
    mockBookings = [];
    mockSubscriptions = [];

    mockUpdateUser = vi.fn((update) => {
      Object.assign(mockUser, update);
    });

    mockApi = {
      get: vi.fn(async (url) => {
        if (url === '/api/family-members') {
          return { data: { success: true, data: mockMembers } };
        }
        if (url === '/api/addresses') {
          return { data: { success: true, data: mockAddresses } };
        }
        if (url === '/api/bookings') {
          return { data: { success: true, data: mockBookings } };
        }
        return { data: {} };
      }),
      post: vi.fn(async (url, data) => {
        if (url === '/api/family-members') {
          const newMember = {
            _id: 'fam_new_1',
            ...data,
          };
          mockMembers.push(newMember);
          return {
            data: {
              success: true,
              data: newMember,
              accountType: 'family',
            },
          };
        }
        if (url === '/api/addresses') {
          const newAddr = {
            _id: 'addr_new_1',
            ...data,
          };
          mockAddresses.push(newAddr);
          return {
            data: {
              success: true,
              data: newAddr,
            },
          };
        }
        return { data: {} };
      }),
      patch: vi.fn(async (url, data) => {
        if (url === '/api/users/me') {
          Object.assign(mockUser, data);
          return { data: { success: true, data: mockUser } };
        }
        if (url.startsWith('/api/addresses/')) {
          const id = url.split('/').pop();
          const addr = mockAddresses.find((a) => a._id === id);
          if (addr && data.isDefault) {
            mockAddresses.forEach((a) => (a.isDefault = false));
            addr.isDefault = true;
          }
          return { data: { success: true, data: addr } };
        }
        if (url.includes('/cancel')) {
          return {
            data: {
              success: true,
              refundAmount: 480,
              cancellationFee: 20,
            },
          };
        }
        if (url.includes('/reschedule')) {
          return {
            data: {
              success: true,
              data: { slotDateTime: data.slotDateTime },
            },
          };
        }
        return { data: {} };
      }),
      delete: vi.fn(async (url) => {
        if (url.startsWith('/api/family-members/')) {
          const id = url.split('/').pop();
          mockMembers = mockMembers.filter((m) => m._id !== id);
          return { data: { success: true, message: 'Member removed' } };
        }
        if (url.startsWith('/api/addresses/')) {
          const id = url.split('/').pop();
          mockAddresses = mockAddresses.filter((a) => a._id !== id);
          return { data: { success: true, message: 'Address removed' } };
        }
        return { data: {} };
      }),
    };
  });

  const renderProfilePage = () => {
    // The Subscriptions tab reads server state through TanStack Query
    // (CONTEXT §7.1), so the page now needs a client. Retries are off so a
    // failing query surfaces immediately instead of stalling the test.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    return render(
      <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: mockUser,
            api: mockApi,
            updateUser: mockUpdateUser,
            logout: vi.fn(),
            isAuthenticated: true,
          }}
        >
          <CartProvider>
          <ProfilePage />
        </CartProvider>
        </AuthContext.Provider>
      </MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('1. Six Tabs Empty States & Navigation', () => {
    it('displays empty state on Family Members tab', async () => {
      renderProfilePage();
      await waitFor(() => {
        expect(screen.getByTestId('family-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText(/No family members yet/i)).toBeInTheDocument();
    });

    it('displays user profile form on My Profile tab and handles update', async () => {
      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-me'));

      await waitFor(() => {
        expect(screen.getByTestId('profile-section')).toBeInTheDocument();
      });

      expect(screen.getByTestId('profile-handle-input')).toHaveValue('@aarav.sharma');
      expect(screen.getByTestId('profile-name-input')).toHaveValue('Aarav Sharma');

      // Edit name and location
      fireEvent.change(screen.getByTestId('profile-name-input'), {
        target: { value: 'Aarav S. Sharma' },
      });
      fireEvent.click(screen.getByTestId('save-profile-btn'));

      await waitFor(() => {
        expect(mockApi.patch).toHaveBeenCalledWith(
          '/api/users/me',
          expect.objectContaining({ name: 'Aarav S. Sharma' })
        );
      });
    });

    it('displays empty state on Address Book tab', async () => {
      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-addr'));

      await waitFor(() => {
        expect(screen.getByTestId('addresses-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText(/No saved addresses/i)).toBeInTheDocument();
    });

    it('displays empty state on Bookings tab', async () => {
      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-bk'));

      await waitFor(() => {
        expect(screen.getByTestId('bookings-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText(/No bookings yet/i)).toBeInTheDocument();
    });

    it('displays empty state on Reports tab', async () => {
      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-rep'));

      await waitFor(() => {
        expect(screen.getByTestId('reports-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText(/No reports yet/i)).toBeInTheDocument();
    });

    it('displays empty state on Subscriptions tab', async () => {
      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-sub'));

      await waitFor(() => {
        expect(screen.getByTestId('subscriptions-empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText(/No care plans yet/i)).toBeInTheDocument();
    });
  });

  describe('2. Address CRUD & Default Handling', () => {
    it('creates an address, sets default, and displays in list', async () => {
      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-addr'));

      await waitFor(() => {
        expect(screen.getByTestId('add-address-btn')).toBeInTheDocument();
      });

      // Open add address modal
      fireEvent.click(screen.getByTestId('add-address-btn'));

      // Fill address form
      fireEvent.change(screen.getByTestId('address-line-input'), {
        target: { value: 'Flat 402, Pine Towers, Rajpur Road' },
      });
      fireEvent.change(screen.getByTestId('address-pin-input'), {
        target: { value: '248001' },
      });
      fireEvent.click(screen.getByTestId('submit-address-btn'));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          '/api/addresses',
          expect.objectContaining({
            label: 'Home',
            line: 'Flat 402, Pine Towers, Rajpur Road',
            pincode: '248001',
            isDefault: true,
          })
        );
      });
    });

    it('allows deleting an address', async () => {
      mockAddresses = [
        {
          _id: 'addr_1',
          label: 'Home',
          line: 'Flat 402, Pine Towers',
          pincode: '248001',
          isDefault: true,
        },
      ];

      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-addr'));

      await waitFor(() => {
        expect(screen.getByTestId('address-card-addr_1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('delete-address-addr_1'));

      await waitFor(() => {
        expect(mockApi.delete).toHaveBeenCalledWith('/api/addresses/addr_1');
      });
    });
  });

  describe('3. Booking Cancellation Modal & Fee Breakdown', () => {
    it('opens cancellation dialog with exact refund breakdown for prepaid booking and confirms', async () => {
      mockBookings = [
        {
          _id: 'booking_prepaid_1',
          testIds: [{ name: 'Lipid Profile' }],
          labCenterId: { name: 'Doon Path Labs' },
          status: 'rider_assigned',
          amount: 500,
          paymentStatus: 'paid',
          slotDateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          familyMemberId: null,
        },
      ];

      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-bk'));

      await waitFor(() => {
        expect(screen.getByTestId('cancel-btn-booking_prepaid_1')).toBeInTheDocument();
      });

      // Click cancel button
      fireEvent.click(screen.getByTestId('cancel-btn-booking_prepaid_1'));

      // Check modal content: exact copy for prepaid cancellations
      expect(screen.getByText(/You paid/i)).toBeInTheDocument();
      expect(screen.getByText(/We will refund/i)).toBeInTheDocument();
      expect(screen.getByText(/₹20 processing fee applies/i)).toBeInTheDocument();

      // Enter optional reason and confirm
      fireEvent.change(screen.getByTestId('cancel-reason-input'), {
        target: { value: 'Travel plans changed' },
      });
      fireEvent.click(screen.getByTestId('confirm-cancel-btn'));

      await waitFor(() => {
        expect(mockApi.patch).toHaveBeenCalledWith('/api/bookings/booking_prepaid_1/cancel', {
          reason: 'Travel plans changed',
        });
      });
    });

    it('shows no cancellation fee message for cash/pending booking', async () => {
      mockBookings = [
        {
          _id: 'booking_cash_1',
          testIds: [{ name: 'Complete Blood Count' }],
          labCenterId: { name: 'Doon Path Labs' },
          status: 'awaiting_confirm',
          amount: 350,
          paymentStatus: 'pending',
          slotDateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          familyMemberId: null,
        },
      ];

      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-bk'));

      await waitFor(() => {
        expect(screen.getByTestId('cancel-btn-booking_cash_1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('cancel-btn-booking_cash_1'));

      expect(
        screen.getByText(/Nothing was charged for this booking, so there is no cancellation fee\./i)
      ).toBeInTheDocument();
    });
  });

  describe('4. Booking Reschedule Modal', () => {
    it('opens reschedule modal, accepts future slot, and submits free reschedule', async () => {
      mockBookings = [
        {
          _id: 'booking_resched_1',
          testIds: [{ name: 'Thyroid Profile' }],
          labCenterId: { name: 'Doon Path Labs' },
          status: 'confirmed',
          amount: 400,
          paymentStatus: 'paid',
          slotDateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          familyMemberId: null,
        },
      ];

      renderProfilePage();
      fireEvent.click(screen.getByTestId('tab-bk'));

      await waitFor(() => {
        expect(screen.getByTestId('reschedule-btn-booking_resched_1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('reschedule-btn-booking_resched_1'));

      expect(screen.getByText(/Rescheduling is free of charge/i)).toBeInTheDocument();

      const futureDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16);
      fireEvent.change(screen.getByTestId('reschedule-slot-input'), {
        target: { value: futureDate },
      });

      fireEvent.click(screen.getByTestId('confirm-reschedule-btn'));

      await waitFor(() => {
        expect(mockApi.patch).toHaveBeenCalledWith(
          '/api/bookings/booking_resched_1/reschedule',
          expect.objectContaining({
            slotDateTime: expect.any(String),
          })
        );
      });
    });
  });
});

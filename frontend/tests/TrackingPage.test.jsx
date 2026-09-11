import React from 'react';
import { CartProvider } from '../src/context/CartContext.jsx';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StatusStepper, HOME_STAGES, VISIT_STAGES } from '../src/components/tracking/StatusStepper.jsx';
import TrackingPage from '../src/pages/TrackingPage.jsx';

// Mock Socket.IO client module
const mockSocket = {
  connected: true,
  listeners: {},
  on: vi.fn((event, callback) => {
    if (!mockSocket.listeners[event]) mockSocket.listeners[event] = [];
    mockSocket.listeners[event].push(callback);
  }),
  off: vi.fn((event, callback) => {
    if (mockSocket.listeners[event]) {
      mockSocket.listeners[event] = mockSocket.listeners[event].filter((cb) => cb !== callback);
    }
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  trigger(event, data) {
    if (mockSocket.listeners[event]) {
      mockSocket.listeners[event].forEach((cb) => cb(data));
    }
  },
};

vi.mock('../src/utils/socketClient.js', () => ({
  getSocket: vi.fn(() => mockSocket),
  joinBookingRoom: vi.fn(),
  leaveBookingRoom: vi.fn(),
}));

// Stable mock API
const mockApi = {
  get: vi.fn(),
};

vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 'user_123', name: 'Aman Patel' },
    api: mockApi,
  }),
}));

describe('Tracking Page & Status Stepper Component Tests (P06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.listeners = {};
  });

  describe('1. StatusStepper Component', () => {
    it('renders all stages for home collection with correct active stage', () => {
      render(<StatusStepper mode="home" status="en_route" />);

      // All home stages should be rendered
      HOME_STAGES.forEach((stage) => {
        expect(screen.getAllByText(stage.label).length).toBeGreaterThan(0);
      });

      // Indicator for prior stages should show checkmark '✓'
      const bookedIndicator = screen.getByTestId('step-indicator-pending');
      expect(bookedIndicator.textContent).toBe('✓');

      const assignedIndicator = screen.getByTestId('step-indicator-rider_assigned');
      expect(assignedIndicator.textContent).toBe('✓');

      // Current stage indicator
      const enRouteIndicator = screen.getByTestId('step-indicator-en_route');
      expect(enRouteIndicator.textContent).toBe('3');
    });

    it('renders all stages for visit collection', () => {
      render(<StatusStepper mode="visit" status="confirmed" />);

      VISIT_STAGES.forEach((stage) => {
        expect(screen.getAllByText(stage.label).length).toBeGreaterThan(0);
      });

      const slotBookedIndicator = screen.getByTestId('step-indicator-awaiting_confirm');
      expect(slotBookedIndicator.textContent).toBe('✓');
    });

    it('renders both responsive structures: horizontal for desktop, vertical for mobile', () => {
      render(<StatusStepper mode="home" status="pending" />);

      const horizontalStepper = screen.getByTestId('stepper-horizontal');
      const verticalStepper = screen.getByTestId('stepper-vertical');

      // Horizontal container uses Tailwind hidden md:flex (desktop only)
      expect(horizontalStepper.className).toContain('hidden');
      expect(horizontalStepper.className).toContain('md:flex');

      // Vertical container uses Tailwind flex md:hidden (mobile only)
      expect(verticalStepper.className).toContain('flex');
      expect(verticalStepper.className).toContain('md:hidden');
    });

    it('renders cancellation notice when booking is cancelled', () => {
      render(<StatusStepper mode="home" status="cancelled" />);
      expect(screen.getByText('Booking Cancelled')).toBeInTheDocument();
      expect(screen.queryByTestId('stepper-horizontal')).not.toBeInTheDocument();
    });
  });

  describe('2. TrackingPage & Reconnect Fallback Flow', () => {
    it('renders booking details and live map during en_route', async () => {
      const mockBooking = {
        _id: 'booking_123',
        status: 'en_route',
        mode: 'home',
        amount: 350,
        paymentMode: 'upi',
        paymentStatus: 'paid',
        collectionAddress: {
          line1: '123 Test St',
          city: 'Bangalore',
          pincode: '560001',
          lat: 12.9716,
          lng: 77.5946,
        },
        testIds: [{ name: 'Complete Blood Count' }],
        assignedRiderId: {
          name: 'Rohit Sharma',
          phone: '9876543210',
          vaccinationStatus: 'Double Vaccinated',
        },
      };

      mockApi.get = vi.fn(async (url) => {
        if (url.includes('booking_123')) {
          return { data: { data: mockBooking } };
        }
        return { data: { data: [] } };
      });

      render(
        <MemoryRouter initialEntries={['/track/booking_123']}>
          <CartProvider>
          <Routes>
            <Route path="/track/:bookingId" element={<TrackingPage />} />
          </Routes>
          </CartProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Track your booking/i)).toBeInTheDocument();
      });

      // Status badge and live map should be visible
      expect(screen.getAllByText(/On The Way/i).length).toBeGreaterThan(0);
      expect(screen.getByTestId('live-tracking-map')).toBeInTheDocument();
      expect(screen.getByText('Rohit Sharma')).toBeInTheDocument();
      expect(screen.getByTestId('rider-call-button')).toBeInTheDocument();
      expect(screen.getByTestId('rider-whatsapp-button')).toBeInTheDocument();
    });

    it('demonstrates reconnect fallback: disconnects socket, updates server-side, reconnects, verifies state recovery', async () => {
      const currentServerBooking = {
        _id: 'booking_reconnect_test',
        status: 'rider_assigned',
        mode: 'home',
        amount: 500,
        collectionAddress: {
          line1: '789 MG Road',
          city: 'Bangalore',
        },
        testIds: [{ name: 'Lipid Profile' }],
      };

      mockApi.get = vi.fn(async () => {
        return { data: { data: { ...currentServerBooking } } };
      });

      render(
        <MemoryRouter initialEntries={['/track/booking_reconnect_test']}>
          <CartProvider>
          <Routes>
            <Route path="/track/:bookingId" element={<TrackingPage />} />
          </Routes>
          </CartProvider>
        </MemoryRouter>
      );

      // 1. Initial render shows rider_assigned
      await waitFor(() => {
        expect(screen.getAllByText(/Rider Assigned/i).length).toBeGreaterThan(0);
      });

      // 2. SIMULATE SOCKET DISCONNECT (e.g. network flap)
      act(() => {
        mockSocket.trigger('disconnect');
      });

      // 3. While socket is disconnected, status advances on server to 'collected'
      currentServerBooking.status = 'collected';
      currentServerBooking.barcode = 'SAMP-998811';

      // 4. SIMULATE SOCKET RECONNECT
      // TrackingPage onConnect handler detects hasDisconnectedRef.current === true,
      // and triggers fetchBooking(true) to recover latest state over REST.
      await act(async () => {
        mockSocket.trigger('connect');
      });

      // 5. Verify REST fetch was called to recover state
      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledTimes(2); // Initial fetch + Reconnect recovery fetch
      });

      // 6. Verify UI now shows 'Sample Collected' and the barcode
      await waitFor(() => {
        expect(screen.getAllByText(/Sample Collected/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText('SAMP-998811').length).toBeGreaterThan(0);
      });
    });
  });
});

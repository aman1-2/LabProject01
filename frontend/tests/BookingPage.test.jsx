import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import BookingPage from '../src/pages/BookingPage.jsx';

const { TEST_DATA, LABS_DATA, DOCTORS_DATA } = vi.hoisted(() => ({
  TEST_DATA: {
    id: '67a123456789abcdef000001',
    _id: '67a123456789abcdef000001',
    slug: 'complete-blood-count-cbc',
    name: 'Complete Blood Count (CBC)',
    category: 'single',
    sampleType: 'Blood',
    homeCollectionAvailable: true,
    basePrice: 299,
  },
  LABS_DATA: {
    labs: [
      {
        id: '67a123456789abcdef000002',
        name: 'Sunrise Diagnostics',
        area: 'Rajpur Road',
        distanceKm: 1.2,
        priceMultiplier: 1.0,
        turnaroundHrs: 6,
        accreditation: { nabl: true, iso: true },
      },
      {
        id: '67a123456789abcdef000003',
        name: 'Doon Path Labs',
        area: 'Ballupur Chowk',
        distanceKm: 3.5,
        priceMultiplier: 0.92,
        turnaroundHrs: 8,
        accreditation: { nabl: true, iso: false },
      },
    ],
  },
  DOCTORS_DATA: [
    {
      _id: '67a123456789abcdef000004',
      name: 'Dr. Sanjay Sharma',
      specialization: 'Internal Medicine',
      clinicName: 'Doon Clinic',
    },
  ],
}));

vi.mock('@pathcare/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchTestBySlug: vi.fn(async () => TEST_DATA),
    fetchNearbyLabs: vi.fn(async () => LABS_DATA),
    fetchDoctors: vi.fn(async () => DOCTORS_DATA),
    // The page no longer computes a price. The quote mirrors the endpoint:
    // catalogue prices per line, the lab's effect as one adjustment, and a
    // total the page must render rather than derive.
    fetchCartQuote: vi.fn(async ({ items, labCenterId }) => {
      const isDoon = labCenterId === '67a123456789abcdef000003';
      const multiplier = isDoon ? 0.92 : 1.0;
      const lines = items.map((slug) => ({
        id: TEST_DATA.id,
        slug,
        name: TEST_DATA.name,
        category: 'single',
        basePrice: TEST_DATA.basePrice,
        turnaroundHrs: 6,
        homeCollectionAvailable: true,
      }));
      const subtotal = lines.reduce((sum, line) => sum + line.basePrice, 0);
      // Deliberately NOT round(subtotal * multiplier). Locally that would be
      // 299 at Sunrise and 275 at Doon; the server says 350 and 410. A page
      // that recomputed instead of reading the response would produce the
      // former and fail — which is what makes these assertions worth having.
      const total = isDoon ? 410 : 350;
      return {
        lines,
        subtotal,
        labAdjustment: total - subtotal,
        total,
        lab: {
          id: labCenterId,
          name: isDoon ? 'Doon Path Labs' : 'Sunrise Diagnostics',
          priceMultiplier: multiplier,
        },
        mode: 'home',
        modeReason: null,
        overlapWarning: null,
        turnaroundHrs: 6,
        totalPending: false,
        currency: 'INR',
      };
    }),
  };
});

describe('BookingPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderBookingPage = (search = '?testId=complete-blood-count-cbc&mode=home') => {
    return render(
      <MemoryRouter initialEntries={[`/book${search}`]}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
        >
        <AuthProvider>
          <CartProvider>
          <Routes>
            <Route path="/book" element={<BookingPage />} />
          </Routes>
        </CartProvider>
        </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };

  it('renders 5-step booking flow and NMC compliance copy verbatim', async () => {
    renderBookingPage();

    await waitFor(() => {
      expect(screen.getByText(/1 · Who is this test for\?/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/2 · Choose a lab/i)).toBeInTheDocument();
    expect(screen.getByText(/3 · Pick a collection slot/i)).toBeInTheDocument();
    expect(screen.getByText(/4 · Were you referred by a doctor\?/i)).toBeInTheDocument();
    expect(screen.getByText(/5 · Payment/i)).toBeInTheDocument();

    // Verify NMC compliance text verbatim per DESIGN_SPEC §5.5
    expect(
      screen.getByText(
        /Reports are delivered directly to your referring doctor at no extra charge\. PathCare does not pay referral commissions\./i
      )
    ).toBeInTheDocument();
  });

  it('allows switching labs and updates server-calculated price quote', async () => {
    renderBookingPage();

    await waitFor(() => {
      expect(screen.getByTestId('select-lab-67a123456789abcdef000003')).toBeInTheDocument();
    });

    // The page no longer computes this — it renders what /api/cart/quote
    // returned, so each assertion waits for that round trip.
    await waitFor(() =>
      expect(screen.getByTestId('confirm-booking-btn')).toHaveTextContent(/350/)
    );

    // Switching centres must re-quote: the query key carries the lab, so a
    // stale total for the previously selected lab can never be left on screen.
    fireEvent.click(screen.getByTestId('select-lab-67a123456789abcdef000003'));

    await waitFor(() =>
      expect(screen.getByTestId('confirm-booking-btn')).toHaveTextContent(/410/)
    );
  });

  it('clearly labels cash option as "payment pending until collection"', async () => {
    renderBookingPage();

    await waitFor(() => {
      expect(screen.getByTestId('pay-cash-card')).toBeInTheDocument();
    });

    expect(screen.getByText(/payment pending until collection/i)).toBeInTheDocument();

    // Click Cash card and check confirm button text
    fireEvent.click(screen.getByTestId('pay-cash-card'));
    expect(screen.getByTestId('confirm-booking-btn')).toHaveTextContent(/Confirm booking/i);
  });

  it('renders Who is this test for section with Myself and Add member chips', async () => {
    renderBookingPage();

    await waitFor(() => {
      expect(screen.getByTestId('patient-self-chip')).toBeInTheDocument();
    });

    expect(screen.getByTestId('patient-add-member-chip')).toBeInTheDocument();
    expect(screen.getByText(/\+ Add member/i)).toBeInTheDocument();
  });
});

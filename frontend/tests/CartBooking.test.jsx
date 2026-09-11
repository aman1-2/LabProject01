import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartProvider } from '../src/context/CartContext.jsx';
import BookingPage from '../src/pages/BookingPage.jsx';

/**
 * Checking out a basket.
 *
 * The point of the cart is one collection instead of three, so what matters is
 * that every test in it reaches the booking payload and the total is the sum —
 * not just the first item. A cart that silently books one test would be worse
 * than no cart at all, because the patient would believe the others were
 * booked too and find out when the phlebotomist arrives.
 */

const CBC = {
  id: '67a123456789abcdef000001',
  _id: '67a123456789abcdef000001',
  slug: 'complete-blood-count-cbc',
  name: 'Complete Blood Count (CBC)',
  category: 'single',
  sampleType: 'Blood',
  homeCollectionAvailable: true,
  basePrice: 299,
  turnaroundHrs: 6,
};

const VITD = {
  id: '67a123456789abcdef000009',
  _id: '67a123456789abcdef000009',
  slug: 'vitamin-d-total',
  name: 'Vitamin D (Total)',
  category: 'single',
  sampleType: 'Blood',
  homeCollectionAvailable: true,
  basePrice: 1200,
  turnaroundHrs: 24,
};

const LABS = {
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
  ],
};

const CATALOGUE = { [CBC.slug]: CBC, [VITD.slug]: VITD };

const fetchTestBySlug = vi.fn(async (slug) => CATALOGUE[slug]);

/**
 * The booking POST. Stubbed at the axios instance the page gets from useAuth,
 * so the assertions can read the exact payload that would go over the wire.
 *
 * `auth` is built ONCE and handed back by reference. The page's load effect
 * lists `api` in its dependencies, so returning a fresh object per render
 * would re-fetch the catalogue forever.
 */
const { post, get, auth } = vi.hoisted(() => {
  const postFn = vi.fn();
  const getFn = vi.fn();
  return {
    post: postFn,
    get: getFn,
    auth: {
      user: { name: 'Test Patient', phone: '9800000000' },
      isAuthenticated: true,
      api: { post: postFn, get: getFn },
      updateUser: vi.fn(),
    },
  };
});

vi.mock('../src/context/AuthContext.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useAuth: () => auth };
});

vi.mock('@pathcare/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchTestBySlug: (...args) => fetchTestBySlug(...args),
    fetchNearbyLabs: vi.fn(async () => LABS),
    fetchDoctors: vi.fn(async () => []),
    // Prices come from the endpoint now; this mirrors its shape.
    fetchCartQuote: vi.fn(async ({ items, labCenterId }) => {
      const lines = items.map((slug) => {
        const item = CATALOGUE[slug];
        return {
          id: item._id,
          slug: item.slug,
          name: item.name,
          category: item.category,
          basePrice: item.basePrice,
          turnaroundHrs: item.turnaroundHrs,
          homeCollectionAvailable: item.homeCollectionAvailable,
        };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.basePrice, 0);
      // The adjustment is what makes this total unreachable from the lines
      // alone: the page must read `total`, not add the column up itself.
      const labAdjustment = 100;
      return {
        lines,
        subtotal,
        labAdjustment,
        total: subtotal + labAdjustment,
        lab: { id: labCenterId, name: 'Sunrise Diagnostics', priceMultiplier: 1 },
        mode: 'home',
        modeReason: null,
        overlapWarning: null,
        turnaroundHrs: 24,
        totalPending: false,
        currency: 'INR',
      };
    }),
  };
});

/** Seeds a basket the way the browser would have left one behind. */
function seedCart(tests) {
  window.localStorage.setItem(
    'pathcare.cart.v1',
    JSON.stringify(
      tests.map((test) => ({
        slug: test.slug,
        id: test._id,
        name: test.name,
        displayPrice: test.basePrice,
        category: test.category,
        turnaroundHrs: test.turnaroundHrs,
        homeCollectionAvailable: test.homeCollectionAvailable,
      }))
    )
  );
}

function renderBooking(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/book${search}`]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <CartProvider>
          <Routes>
            <Route path="/book" element={<BookingPage />} />
          </Routes>
        </CartProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('booking a cart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    post.mockResolvedValue({ data: { data: { _id: 'bk_1', mode: 'home' } } });
    get.mockResolvedValue({ data: { data: [] } });
  });

  it('loads every test in the cart when no slug is in the URL', async () => {
    seedCart([CBC, VITD]);
    renderBooking();

    await waitFor(() => expect(screen.getByTestId('booking-items-summary')).toBeInTheDocument());

    expect(fetchTestBySlug).toHaveBeenCalledWith(CBC.slug);
    expect(fetchTestBySlug).toHaveBeenCalledWith(VITD.slug);
    expect(screen.getByTestId('booking-items-summary')).toHaveTextContent('2 tests');
  });

  it('itemises the basket and totals it at the chosen lab', async () => {
    seedCart([CBC, VITD]);
    renderBooking();

    // Awaited on the CONTENT, not the element: the total renders as '—' until
    // the server answers, so waiting for the node alone races the quote.
    await waitFor(() =>
      expect(screen.getByTestId('booking-total')).toHaveTextContent('₹1,599')
    );

    // Lines plus the lab row equal the total, by construction: 1,499 + 100.
    expect(screen.getByTestId('booking-lab-adjustment')).toHaveTextContent('₹100');

    // A single lump sum is not something a patient can check against what
    // they added, so every line is shown — at the catalogue price, with the
    // lab's effect as its own row.
    expect(screen.getByTestId(`summary-line-${CBC.slug}`)).toHaveTextContent('₹299');
    expect(screen.getByTestId(`summary-line-${VITD.slug}`)).toHaveTextContent('₹1,200');
  });

  it('re-fetches prices from the catalogue instead of trusting the stored cart', async () => {
    // The cart was written when this test cost ₹1. It has since gone up.
    window.localStorage.setItem(
      'pathcare.cart.v1',
      JSON.stringify([
        { slug: CBC.slug, id: CBC._id, name: CBC.name, displayPrice: 1, category: 'single', homeCollectionAvailable: true },
      ])
    );
    renderBooking();

    // The live price, not the one the browser was carrying around.
    await waitFor(() =>
      expect(screen.getByTestId('booking-total')).toHaveTextContent('₹399')
    );
  });

  it('a slug in the URL books only that test, ignoring the cart', async () => {
    // "Book this one now" from a test page must not quietly sweep in whatever
    // else the patient happened to be browsing earlier.
    seedCart([CBC, VITD]);
    renderBooking(`?testId=${CBC.slug}&mode=home`);

    await waitFor(() => expect(screen.getByTestId('booking-items-summary')).toBeInTheDocument());

    expect(fetchTestBySlug).toHaveBeenCalledTimes(1);
    expect(fetchTestBySlug).toHaveBeenCalledWith(CBC.slug);
    expect(screen.getByTestId('booking-items-summary')).toHaveTextContent(CBC.name);
    expect(screen.queryByTestId(`summary-line-${VITD.slug}`)).not.toBeInTheDocument();
  });

  it('sends EVERY test in the basket to the API, not just the first', async () => {
    seedCart([CBC, VITD]);
    renderBooking();

    await waitFor(() => expect(screen.getByTestId('confirm-booking-btn')).toBeEnabled());

    // Cash, so the flow completes without Razorpay's script.
    fireEvent.click(screen.getByTestId('pay-cash-card'));
    fireEvent.click(screen.getByTestId('confirm-booking-btn'));

    await waitFor(() => expect(post).toHaveBeenCalled());

    const [url, payload] = post.mock.calls[0];
    expect(url).toBe('/api/bookings');
    // Packages are split out so a checkup is recorded as one, not as a test line.
    expect(payload.packageIds).toEqual([]);
    // This is the assertion the whole cart rests on. If it ever reduces to one
    // id, a patient pays for a panel and gets a single test collected.
    expect(payload.testIds).toEqual([CBC._id, VITD._id]);
  });

  it('empties the basket once the booking exists, so it cannot be booked twice', async () => {
    seedCart([CBC, VITD]);
    renderBooking();

    await waitFor(() => expect(screen.getByTestId('confirm-booking-btn')).toBeEnabled());
    fireEvent.click(screen.getByTestId('pay-cash-card'));
    fireEvent.click(screen.getByTestId('confirm-booking-btn'));

    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('pathcare.cart.v1'))).toEqual([])
    );
  });

  it('asks for a test when the cart is empty and no slug was given', async () => {
    renderBooking();

    await waitFor(() =>
      expect(screen.getByText(/No test specified for booking/i)).toBeInTheDocument()
    );
    expect(fetchTestBySlug).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartProvider, useCart } from '../src/context/CartContext.jsx';
import CartDrawer from '../src/components/organisms/CartDrawer.jsx';

/**
 * The drawer no longer adds anything up — it asks the server. These tests are
 * about the CART's behaviour, so the quote is stubbed with a shape that mirrors
 * the endpoint; the arithmetic itself is covered where it lives, in
 * backend/tests/integration/cartQuote.test.js.
 */
const fetchCartQuote = vi.fn();
vi.mock('@pathcare/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchCartQuote: (...args) => fetchCartQuote(...args) };
});

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

/** Signed-in state is a per-test switch: checkout branches on it. */
const authed = { value: false };
vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({ isAuthenticated: authed.value }),
}));

/**
 * The cart.
 *
 * Both competitors let you build a basket and check out once; we could only
 * book one test at a time. The backend already took `testIds` as an array, so
 * the gap was entirely in the UI — which means these tests are the only thing
 * standing behind the two rules the cart enforces:
 *
 *   1. Prices in the cart are for DISPLAY. Nothing here may decide what someone
 *      is charged; checkout re-fetches every price from the catalogue.
 *   2. One booking has ONE collection mode, and a package is booked alone.
 *
 * Both are easy to "simplify" away later by someone who reads the cart as a
 * dumb list of items, so each is pinned below.
 */

const BLOOD = {
  slug: 'thyroid-profile',
  _id: '651111111111111111111111',
  name: 'Thyroid Profile',
  basePrice: 599,
  category: 'single',
  turnaroundHrs: 12,
  homeCollectionAvailable: true,
};

const VITAMIN_D = {
  slug: 'vitamin-d',
  _id: '651111111111111111111112',
  name: 'Vitamin D',
  basePrice: 1200,
  category: 'single',
  turnaroundHrs: 24,
  homeCollectionAvailable: true,
};

const MRI = {
  slug: 'mri-brain',
  _id: '651111111111111111111113',
  name: 'MRI Brain',
  basePrice: 6500,
  category: 'imaging',
  turnaroundHrs: 48,
  homeCollectionAvailable: false,
};

const PACKAGE = {
  slug: 'full-body-essential',
  _id: '651111111111111111111114',
  name: 'Full Body Checkup — Essential',
  basePrice: 1499,
  category: 'package',
  turnaroundHrs: 8,
  homeCollectionAvailable: true,
};

/** Exposes the hook so behaviour can be driven without a page in the way. */
let cart;
function Probe() {
  cart = useCart();
  return null;
}

function renderCart({ open = true } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CartProvider>
          <Probe />
          <CartDrawer open={open} onClose={() => {}} />
        </CartProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** A quote shaped like the endpoint's, priced from whatever was asked for. */
function stubQuote(pricesBySlug, extra = {}) {
  fetchCartQuote.mockImplementation(async ({ items }) => {
    const lines = items.map((slug) => ({
      slug,
      name: slug,
      category: 'single',
      basePrice: pricesBySlug[slug] ?? 0,
      turnaroundHrs: 12,
      homeCollectionAvailable: true,
    }));
    const subtotal = lines.reduce((sum, line) => sum + line.basePrice, 0);
    return {
      lines,
      subtotal,
      mode: 'home',
      modeReason: null,
      visitOnlyItems: [],
      turnaroundHrs: 12,
      overlapWarning: null,
      lab: null,
      labAdjustment: null,
      total: null,
      totalPending: true,
      totalPendingReason: 'Choose a lab centre to see the final price.',
      currency: 'INR',
      ...extra,
    };
  });
}

describe('cart behaviour', () => {
  beforeEach(() => {
    window.localStorage.clear();
    cart = undefined;
    fetchCartQuote.mockReset();
    stubQuote({
      [BLOOD.slug]: BLOOD.basePrice,
      [VITAMIN_D.slug]: VITAMIN_D.basePrice,
      [MRI.slug]: MRI.basePrice,
      [PACKAGE.slug]: PACKAGE.basePrice,
    });
    navigate.mockClear();
    authed.value = false;
  });

  it('starts empty and says so', () => {
    renderCart();
    expect(cart.count).toBe(0);
    expect(screen.getByText(/Your cart is empty/i)).toBeInTheDocument();
  });

  it('adds tests and shows the total the server returned', async () => {
    renderCart();
    act(() => {
      cart.add(BLOOD);
      cart.add(VITAMIN_D);
    });

    expect(cart.count).toBe(2);
    expect(screen.getByTestId('cart-item-thyroid-profile')).toBeInTheDocument();

    // Awaited, because the drawer no longer adds anything up — it asks
    // /api/cart/quote and renders the answer.
    await waitFor(() =>
      expect(screen.getByTestId('cart-total')).toHaveTextContent('₹1,799')
    );
    expect(fetchCartQuote).toHaveBeenCalledWith({
      items: [BLOOD.slug, VITAMIN_D.slug],
    });
  });

  it('ignores a second add of the same test rather than duplicating it', () => {
    renderCart();
    act(() => {
      cart.add(BLOOD);
      cart.add(BLOOD);
    });

    expect(cart.count).toBe(1);
    expect(cart.indicativeTotal).toBe(599);
  });

  it('takes a blood test and a scan in the same basket', () => {
    renderCart();
    act(() => {
      cart.add(BLOOD);
    });
    act(() => {
      cart.add(MRI);
    });

    // This used to be refused, back when the client had to choose the mode and
    // a booking could carry one package. Both are the server's now: the quote
    // resolves the whole basket to a single lab-visit booking and returns the
    // sentence saying which item made it so.
    expect(cart.count).toBe(2);
    expect(cart.lastRejection).toBeNull();
  });

  it('takes them in the other order too', () => {
    renderCart();
    act(() => {
      cart.add(MRI);
    });
    act(() => {
      cart.add(BLOOD);
    });

    expect(cart.count).toBe(2);
    expect(cart.lastRejection).toBeNull();
  });

  it('takes a checkup package alongside individual tests', () => {
    renderCart();
    act(() => {
      cart.add(PACKAGE);
    });
    act(() => {
      cart.add(BLOOD);
    });

    // Both are charged. A package lists panel names ("CBC (24)") and a test
    // lists analytes ("Hemoglobin"), so overlap cannot be detected reliably —
    // the quote warns rather than silently dropping or silently double-charging.
    expect(cart.count).toBe(2);
    expect(cart.lastRejection).toBeNull();

    act(() => {
      cart.clear();
      cart.add(BLOOD);
    });
    act(() => {
      cart.add(PACKAGE);
    });
    expect(cart.count).toBe(2);
  });

  it('still refuses to add the same test twice', () => {
    renderCart();
    act(() => {
      cart.add(BLOOD);
    });
    act(() => {
      cart.add(BLOOD);
    });

    // A double-tap on a slow connection is not a decision to buy two.
    expect(cart.count).toBe(1);
  });

  it('removes an item and re-prices the rest', async () => {
    renderCart();
    act(() => {
      cart.add(BLOOD);
      cart.add(VITAMIN_D);
    });

    fireEvent.click(screen.getByTestId('cart-remove-thyroid-profile'));

    expect(cart.count).toBe(1);
    expect(screen.queryByTestId('cart-item-thyroid-profile')).not.toBeInTheDocument();

    // The query key carries the basket, so removing an item re-quotes rather
    // than leaving a total for a cart the patient no longer has.
    await waitFor(() =>
      expect(screen.getByTestId('cart-total')).toHaveTextContent('₹1,200')
    );
  });

  it('survives a page reload', () => {
    const first = renderCart();
    act(() => {
      cart.add(BLOOD);
    });
    first.unmount();

    renderCart();
    expect(cart.count).toBe(1);
    expect(cart.items[0].slug).toBe(BLOOD.slug);
  });

  it('starts empty rather than crashing when stored data is corrupt', () => {
    window.localStorage.setItem('pathcare.cart.v1', '{not json');
    renderCart();

    // A bad cart must never be able to stop the site rendering.
    expect(cart.count).toBe(0);
  });

  it('never lets a stored price decide what is charged', async () => {
    // A cart written days ago, at a price that has since changed.
    window.localStorage.setItem(
      'pathcare.cart.v1',
      JSON.stringify([{ ...BLOOD, displayPrice: 1 }])
    );
    renderCart();

    // The cart happily renders the stale number...
    expect(cart.indicativeTotal).toBe(1);
    // ...but carries the slug and id that checkout re-prices from the
    // catalogue. If this ever grows a field the booking payload trusts for
    // money, this assertion is the one that should stop it.
    expect(cart.items[0].slug).toBe(BLOOD.slug);

    // ...and the figure on screen is the server's, not the stale ₹1.
    await waitFor(() =>
      expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('₹599')
    );
    expect(
      screen.getByText(/Choose a lab centre to see the final price/i)
    ).toBeInTheDocument();
  });

  it('reports the mode of the basket so the booking page can honour it', () => {
    renderCart();
    act(() => {
      cart.add(BLOOD);
    });
    expect(cart.mode).toBe('home');

    act(() => {
      cart.clear();
      cart.add(MRI);
    });
    expect(cart.mode).toBe('visit');
  });

  it('renders nothing when closed', () => {
    renderCart({ open: false });
    expect(screen.queryByTestId('cart-drawer')).not.toBeInTheDocument();
  });

  it('sends a signed-in patient straight to booking', () => {
    authed.value = true;
    renderCart();
    act(() => {
      cart.add(BLOOD);
    });

    fireEvent.click(screen.getByTestId('cart-checkout'));
    expect(navigate).toHaveBeenCalledWith('/book');
  });

  it('carries the destination through sign-in when signed out', () => {
    renderCart();
    act(() => {
      cart.add(BLOOD);
    });

    fireEvent.click(screen.getByTestId('cart-checkout'));

    // Without the `from` state, signing in lands you on the home page holding a
    // full cart with no explanation of what just happened.
    expect(navigate).toHaveBeenCalledWith('/auth', {
      state: { from: { pathname: '/book', search: '' } },
    });
  });

  it('shows the server\'s reason when a scan turns the basket into a lab visit', async () => {
    stubQuote(
      { [BLOOD.slug]: BLOOD.basePrice, [MRI.slug]: MRI.basePrice },
      {
        mode: 'visit',
        modeReason:
          'MRI Brain needs lab equipment, so this booking is a lab visit. Everything in it is collected at the centre.',
        visitOnlyItems: [MRI.slug],
      }
    );

    renderCart();
    act(() => {
      cart.add(BLOOD);
      cart.add(MRI);
    });

    // The client does not decide this and does not word it. A basket silently
    // becoming a lab visit reads as a bug; naming the item that caused it does
    // not.
    const notice = await screen.findByTestId('cart-mode-notice');
    expect(notice).toHaveTextContent(/MRI Brain/);
    expect(notice).toHaveTextContent(/lab visit/i);
  });

  it('passes on the overlap warning without dropping either line', async () => {
    stubQuote(
      { [PACKAGE.slug]: PACKAGE.basePrice, [BLOOD.slug]: BLOOD.basePrice },
      {
        overlapWarning:
          'Your cart has a checkup package alongside individual tests. Packages already cover several parameters, so some may be repeated — and repeated items are charged separately.',
      }
    );

    renderCart();
    act(() => {
      cart.add(PACKAGE);
      cart.add(BLOOD);
    });

    expect(await screen.findByTestId('cart-overlap-warning')).toHaveTextContent(/repeated/i);
    // Both are still there and both are charged — the warning is disclosure,
    // not a silent correction.
    expect(screen.getByTestId(`cart-item-${PACKAGE.slug}`)).toBeInTheDocument();
    expect(screen.getByTestId(`cart-item-${BLOOD.slug}`)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('₹2,098')
    );
  });

  it('fails loudly when the cart cannot be priced', async () => {
    fetchCartQuote.mockRejectedValue(new Error('Network Error'));

    renderCart();
    act(() => {
      cart.add(BLOOD);
    });

    // Falling back to adding up the stored numbers would put a figure on
    // screen that nothing stands behind.
    expect(await screen.findByTestId('cart-quote-error')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-total')).not.toBeInTheDocument();
  });

  it('sends only slugs to the server, never a price', async () => {
    renderCart();
    act(() => {
      cart.add(BLOOD);
    });

    await waitFor(() => expect(fetchCartQuote).toHaveBeenCalled());

    // A caller proposing what it pays is the defect CONTEXT §3.2 exists for,
    // and the cart is the obvious place for one to creep in.
    const [payload] = fetchCartQuote.mock.calls.at(-1);
    expect(Object.keys(payload)).toEqual(['items']);
    expect(payload.items).toEqual([BLOOD.slug]);
  });

  it('throws if used outside a provider, rather than silently doing nothing', () => {
    // A cart that quietly no-ops would lose a patient's basket with no error.
    expect(() => render(<Probe />)).toThrow(/CartProvider/);
  });
});

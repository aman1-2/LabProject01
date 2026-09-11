import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';

/**
 * The test cart.
 *
 * Both competitors let you add several tests and check out once; we could only
 * book one at a time, which meant a patient wanting a thyroid panel *and*
 * vitamin D had to go through the whole flow twice — two collections, two
 * visits, two fees. The backend already accepted `testIds: []` as an array,
 * so this was a UI-only gap.
 *
 * THE ONE RULE THIS FILE STILL ENFORCES
 *
 * NO PRICES ARE TRUSTED FROM HERE. The cart stores slugs and display prices
 * for rendering only, and only until the server quote arrives. Checkout prices
 * every item server-side (CONTEXT §3.2, §7.3). A stale cart from three days
 * ago must not decide what someone is charged.
 *
 * WHAT THIS FILE USED TO ENFORCE, AND WHY IT NO LONGER DOES
 *
 * It refused to mix a package with loose tests, and refused to mix collection
 * modes. Both were right when a booking could carry one package and the client
 * had to pick the mode itself. Both are now the server's: POST /api/cart/quote
 * prices whatever the basket holds and resolves the single mode for it — a
 * basket containing a scan becomes one lab-visit booking, and says which item
 * made it so. Keeping the refusals here would mean the cart forbidding baskets
 * the backend prices correctly.
 *
 * A package sitting next to a test it already covers is charged for both. That
 * is a deliberate product decision, not an oversight: a package lists panel
 * names ("CBC (24)") while a test lists analytes ("Hemoglobin"), so overlap
 * cannot be detected reliably, and the quote says so rather than guessing.
 *
 * WHY A REDUCER AND NOT TWO useStates
 *
 * Whether an add is accepted depends on what is already in the cart, so the
 * check has to see the current items — which means running inside the state
 * transition. A `setItems` updater does that, but it cannot also set a second
 * piece of state, and React runs it at re-render time rather than at call
 * time, so a `let rejected` captured outside it is still null by the time you
 * read it. (That was a real bug here; the message never appeared.) Deciding
 * and explaining are one transition, so they are one piece of state.
 *
 * Client state, so Context is right (CONTEXT §7.1 — server data belongs in
 * TanStack Query, not here).
 */

const CartContext = createContext(null);

const STORAGE_KEY = 'pathcare.cart.v1';

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt cart must not stop the site loading.
    return [];
  }
}

function toEntry(test) {
  return {
    slug: test.slug,
    id: test._id ?? test.id ?? null,
    name: test.name,
    // Display only — never used to charge. See the note at the top.
    displayPrice: test.basePrice,
    category: test.category,
    turnaroundHrs: test.turnaroundHrs,
    homeCollectionAvailable: test.homeCollectionAvailable !== false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const entry = toEntry(action.test);

      // Adding what is already there is a no-op, not an error — a double-tap
      // on a slow connection must not produce a scolding message.
      if (state.items.some((item) => item.slug === entry.slug)) {
        return { items: state.items, lastRejection: null };
      }

      return { items: [...state.items, entry], lastRejection: null };
    }
    case 'remove':
      return {
        items: state.items.filter((item) => item.slug !== action.slug),
        lastRejection: null,
      };
    case 'clear':
      return { items: [], lastRejection: null };
    case 'dismiss':
      return { items: state.items, lastRejection: null };
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    items: readStored(),
    lastRejection: null,
  }));
  const { items, lastRejection } = state;

  // The drawer lives in the navbar but is opened from catalogue cards, the
  // test page and the sticky mobile bar, so its open state belongs here rather
  // than being threaded through every page as a prop.
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Private browsing, or storage full. The cart still works this session.
    }
  }, [items]);

  /**
   * A hint for the UI before the quote arrives — the server resolves the real
   * mode and returns the sentence explaining it. Home only if EVERY item
   * supports it, which is the same rule, computed twice for latency only.
   */
  const mode = useMemo(
    () => (items.every((item) => item.homeCollectionAvailable !== false) ? 'home' : 'visit'),
    [items]
  );

  const add = useCallback((test) => dispatch({ type: 'add', test }), []);
  const remove = useCallback((slug) => dispatch({ type: 'remove', slug }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  const dismissRejection = useCallback(() => dispatch({ type: 'dismiss' }), []);

  const has = useCallback((slug) => items.some((item) => item.slug === slug), [items]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  /**
   * Indicative only, and named so nobody mistakes it for the amount charged.
   * The real figure comes back from the server at checkout, per lab.
   */
  const indicativeTotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.displayPrice) || 0), 0),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      count: items.length,
      mode,
      indicativeTotal,
      lastRejection,
      isOpen,
      add,
      remove,
      clear,
      has,
      openCart,
      closeCart,
      dismissRejection,
    }),
    [
      items,
      mode,
      indicativeTotal,
      lastRejection,
      isOpen,
      add,
      remove,
      clear,
      has,
      openCart,
      closeCart,
      dismissRejection,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside a CartProvider');
  }
  return context;
}

export default CartContext;

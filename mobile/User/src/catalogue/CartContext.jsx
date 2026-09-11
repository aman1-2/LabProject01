import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The test basket, for the app.
 *
 * The same idea as the website's cart: a patient booking a checkup and an
 * extra test should get ONE collection — one slot, one phlebotomist, one
 * payment — instead of going through the whole flow twice.
 *
 * WHAT IT STORES, AND WHAT IT REFUSES TO DECIDE
 *
 * Slugs and display prices, and nothing else. The display price is for the
 * list only; every price a patient is charged is re-fetched from
 * /api/cart/quote at checkout (CONTEXT §7.3). A basket left on the phone for a
 * week must not decide what anyone pays.
 *
 * AsyncStorage rather than SecureStore, deliberately. SecureStore is for
 * credentials; a shopping basket is not one, and putting it there would both
 * waste the Keystore and slow every read.
 *
 * There are no "you cannot add that" rules. The server decides: it prices any
 * combination, resolves the single collection mode for the basket, and says
 * which item forced a lab visit. Duplicating those rules here would be a
 * second opinion that can disagree with the one that matters.
 */

const CartContext = createContext(null);
const STORAGE_KEY = 'pathcare.cart.v1';

function reducer(state, action) {
  switch (action.type) {
    case 'hydrate':
      return { items: action.items, ready: true };
    case 'add': {
      // Adding what is already there is a no-op, not an error: a double tap on
      // a slow connection must not produce two lines or a scolding message.
      if (state.items.some((item) => item.slug === action.item.slug)) return state;
      return { ...state, items: [...state.items, action.item] };
    }
    case 'remove':
      return { ...state, items: state.items.filter((item) => item.slug !== action.slug) };
    case 'clear':
      return { ...state, items: [] };
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { items: [], ready: false });

  // Restored once on mount. `ready` exists so the badge does not flash empty
  // before the basket loads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!cancelled) {
          dispatch({ type: 'hydrate', items: Array.isArray(parsed) ? parsed : [] });
        }
      } catch {
        // A corrupt basket must not stop the app starting.
        if (!cancelled) dispatch({ type: 'hydrate', items: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)).catch(() => {
      // Storage full or unavailable. The basket still works this session.
    });
  }, [state.items, state.ready]);

  const add = useCallback((test) => {
    dispatch({
      type: 'add',
      item: {
        slug: test.slug,
        id: test._id ?? test.id ?? null,
        name: test.name,
        // Display only. Never used to charge — see the note at the top.
        displayPrice: test.basePrice,
        category: test.category,
        turnaroundHrs: test.turnaroundHrs,
        homeCollectionAvailable: test.homeCollectionAvailable !== false,
      },
    });
  }, []);

  const remove = useCallback((slug) => dispatch({ type: 'remove', slug }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  const has = useCallback((slug) => state.items.some((i) => i.slug === slug), [state.items]);

  /**
   * Indicative only, and named so nobody mistakes it for the amount charged.
   * The real figure comes from the server, per lab, at checkout.
   */
  const indicativeTotal = useMemo(
    () => state.items.reduce((sum, item) => sum + (Number(item.displayPrice) || 0), 0),
    [state.items]
  );

  const value = useMemo(
    () => ({
      items: state.items,
      count: state.items.length,
      ready: state.ready,
      indicativeTotal,
      add,
      remove,
      clear,
      has,
    }),
    [state.items, state.ready, indicativeTotal, add, remove, clear, has]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider');
  return context;
}

export default CartContext;

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchCartQuote } from '@pathcare/api';
import { useCart } from '../../context/CartContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../atoms/Icon.jsx';

/**
 * The cart, as a slide-over.
 *
 * A drawer rather than a page because adding a test is something you do WHILE
 * browsing — sending someone to a separate route breaks the browse, which is
 * how carts lose items.
 *
 * EVERY NUMBER HERE COMES FROM THE SERVER
 *
 * The drawer used to add up the prices it had stored and show the result. It
 * no longer computes anything: it POSTs the slugs to /api/cart/quote and
 * renders what comes back. That endpoint prices the basket with
 * `calculateBookingPrice` — the same function the booking charges with — so
 * what this shows and what leaves the patient's account cannot disagree.
 *
 * The stored prices survive only as a skeleton value while the quote is in
 * flight, and are labelled as such. They are never presented as the total.
 */
const RUPEES = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

export default function CartDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { items, count, remove, clear } = useCart();

  const slugs = items.map((item) => item.slug);

  const {
    data: quote,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    // Keyed on the basket, so changing it re-prices rather than showing a
    // total for a cart the patient no longer has.
    queryKey: ['cart', 'quote', slugs.join(',')],
    queryFn: () => fetchCartQuote({ items: slugs }),
    enabled: open && slugs.length > 0,
    staleTime: 0,
  });

  if (!open) return null;

  function checkout() {
    onClose();

    if (isAuthenticated) {
      navigate('/book');
      return;
    }

    // Carry the destination through sign-in. Without the `from` state, signing
    // in lands you on the home page holding a full cart with no explanation of
    // what just happened.
    navigate('/auth', { state: { from: { pathname: '/book', search: '' } } });
  }

  const mode = quote?.mode ?? null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Your tests">
      <button
        type="button"
        aria-label="Close cart"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
      />

      <aside
        data-testid="cart-drawer"
        className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col bg-white shadow-float"
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-cardTitle font-extrabold text-ink">Your tests</h2>
            <p className="mt-0.5 text-caption text-muted">
              {count === 0
                ? 'Nothing added yet'
                : `${count} ${count === 1 ? 'item' : 'items'}${
                    mode ? ` · ${mode === 'home' ? 'home collection' : 'lab visit'}` : ''
                  }`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition hover:text-ink"
          >
            <Icon name="x" size={16} strokeWidth={2.2} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {count === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue50 text-blue700">
                <Icon name="flask" size={24} strokeWidth={1.9} />
              </span>
              <p className="mt-4 text-bodySmall font-extrabold text-ink">Your cart is empty</p>
              <p className="mt-1.5 max-w-[280px] text-caption leading-relaxed text-muted">
                Add checkups, individual tests and scans as you browse, and book them together.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/tests');
                }}
                className="mt-5 rounded-pill bg-blue600 px-6 py-2.5 text-bodySmall font-bold text-white transition hover:bg-blue700"
              >
                Browse tests
              </button>
            </div>
          ) : (
            <>
              {/* The server says a scan forced this basket to a lab visit, and
                  which item did it. Shown before the lines, because it changes
                  what the patient is agreeing to. */}
              {quote?.modeReason && (
                <div
                  data-testid="cart-mode-notice"
                  className="mb-4 flex items-start gap-2.5 rounded-lg border border-blue100 bg-blue50 px-3.5 py-3"
                >
                  <Icon name="hospital" size={15} className="mt-0.5 shrink-0 text-blue600" />
                  <p className="text-caption leading-relaxed text-ink">{quote.modeReason}</p>
                </div>
              )}

              {/* A package next to a test it may already cover. We cannot tell
                  which parameters overlap, so the patient is told rather than
                  having a line silently dropped or silently charged twice. */}
              {quote?.overlapWarning && (
                <div
                  data-testid="cart-overlap-warning"
                  className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber bg-amberBg px-3.5 py-3"
                >
                  <Icon name="info" size={15} className="mt-0.5 shrink-0 text-amberDark" />
                  <p className="text-caption leading-relaxed text-ink">{quote.overlapWarning}</p>
                </div>
              )}

              <ul className="space-y-3">
                {items.map((item) => {
                  // Prefer the server's line: the name and price there are
                  // live, the stored ones may be days old.
                  const line = quote?.lines?.find((candidate) => candidate.slug === item.slug);
                  const name = line?.name ?? item.name;
                  const price = line?.basePrice;

                  return (
                    <li
                      key={item.slug}
                      data-testid={`cart-item-${item.slug}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border p-4"
                    >
                      <div className="min-w-0">
                        <p className="text-bodySmall font-extrabold text-ink">{name}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-muted">
                          {line?.category && (
                            <span className="rounded-pill bg-chipGreyBg px-2 py-0.5 font-bold capitalize text-muted">
                              {line.category === 'imaging' ? 'scan' : line.category}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Icon name="clock" size={12} strokeWidth={2.2} />
                            {line?.turnaroundHrs ?? item.turnaroundHrs} hrs
                          </span>
                          {line?.homeCollectionAvailable === false && (
                            <span className="text-amberDark">· lab visit only</span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="text-bodySmall font-extrabold text-ink">
                          {typeof price === 'number' ? RUPEES(price) : '—'}
                        </span>
                        <button
                          type="button"
                          data-testid={`cart-remove-${item.slug}`}
                          onClick={() => remove(item.slug)}
                          aria-label={`Remove ${name}`}
                          className="text-caption font-bold text-muted transition hover:text-redDark"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {count > 0 && (
          <footer className="border-t border-border px-6 py-5">
            {isError ? (
              <div data-testid="cart-quote-error">
                {/* Not knowing the price has to fail loudly. Falling back to
                    adding up the stored numbers would be showing a figure we
                    cannot stand behind. */}
                <p className="text-caption leading-relaxed text-redDark">
                  {error?.message || 'We could not price your cart just now.'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-3 w-full rounded-pill border-[1.5px] border-border py-2.5 text-bodySmall font-bold text-ink transition hover:border-blue600 hover:text-blue600"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5" data-testid="cart-summary">
                  <div className="flex items-baseline justify-between text-bodySmall">
                    <span className="text-muted">Subtotal</span>
                    <span className="font-bold text-ink" data-testid="cart-subtotal">
                      {isPending ? '…' : RUPEES(quote.subtotal)}
                    </span>
                  </div>

                  {/* One row for the lab's effect on the whole basket, because
                      the server rounds once over the basket. Per-line
                      multipliers would not add up to the total. */}
                  {!isPending && quote.lab && (
                    <div className="flex items-baseline justify-between text-bodySmall">
                      <span className="text-muted">{quote.lab.name}</span>
                      <span
                        className="font-bold text-ink"
                        data-testid="cart-lab-adjustment"
                      >
                        {quote.labAdjustment > 0 ? '+' : ''}
                        {RUPEES(quote.labAdjustment)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                  <span className="text-bodySmall font-bold text-ink">
                    {quote?.totalPending === false ? 'Total' : 'Estimated total'}
                  </span>
                  <span className="text-price font-extrabold text-ink" data-testid="cart-total">
                    {isPending ? '…' : quote.total === null ? RUPEES(quote.subtotal) : RUPEES(quote.total)}
                  </span>
                </div>

                <p className="mt-1.5 text-caption leading-relaxed text-muted">
                  {quote?.totalPendingReason ??
                    'Confirmed against the live catalogue before you pay.'}
                </p>
              </>
            )}

            <button
              type="button"
              data-testid="cart-checkout"
              onClick={checkout}
              className="mt-4 w-full rounded-pill bg-blue600 py-3.5 text-body font-bold text-white transition hover:bg-blue700"
            >
              Choose a lab and slot
            </button>
            <button
              type="button"
              onClick={clear}
              className="mt-2 w-full py-2 text-caption font-bold text-muted transition hover:text-redDark"
            >
              Clear cart
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

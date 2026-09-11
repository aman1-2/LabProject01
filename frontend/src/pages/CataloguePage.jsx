import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar.jsx';
import WhatsAppFab from '../components/layout/WhatsAppFab.jsx';
import Card from '../components/atoms/Card.jsx';
import Chip from '../components/atoms/Chip.jsx';
import EmptyState from '../components/atoms/EmptyState.jsx';
import Skeleton from '../components/atoms/Skeleton.jsx';
import { useTests } from '@pathcare/api';
import { useCart } from '../context/CartContext.jsx';
import Icon from '../components/atoms/Icon.jsx';

export default function CataloguePage() {
  const navigate = useNavigate();
  const { add, has, count, indicativeTotal, openCart, lastRejection, dismissRejection } = useCart();
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Server state comes from a TanStack Query hook in common/api (CONTEXT §7.1).
  // Filtering is the server's job — the query key carries the filters, so each
  // distinct filter combination is cached and de-duplicated on its own.
  const {
    data,
    isPending: loading,
    isError,
    error: queryError,
    refetch,
  } = useTests({ category: activeCategory, search: searchQuery, limit: 100 });

  const tests = data?.items ?? [];
  // The catalogue is served from the live database. If it cannot be reached we
  // say so, rather than showing a bundled copy that may be stale or priced
  // differently (CONTEXT §3.1, §3.2).
  const error = isError
    ? queryError?.message || 'We could not load the test catalogue just now. Please try again.'
    : null;

  // Category chip groups matching prototype §3.4
  const filterChips = [
    { key: 'all', label: 'All' },
    { key: 'package', label: 'Full Body Checkups' },
    { key: 'single', label: 'Single Tests' },
    { key: 'imaging', label: 'Imaging & Scans' },
    { key: 'plan', label: 'Care Plans' },
  ];

  // Defined grouped sections
  const sections = [
    { key: 'package', title: 'Full Body Checkups' },
    { key: 'plan', title: 'Care Plans (auto-booked)' },
    { key: 'single', title: 'Single Tests' },
    { key: 'imaging', title: 'Imaging & Scans — lab visit only' },
  ];

  const handleCardClick = (slug) => {
    navigate(`/tests/${slug}`);
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1240px] w-full mx-auto px-5 sm:px-7 py-8 sm:py-10">
        {/* Header Eyebrow & Title */}
        <div className="mb-6">
          <p className="text-eyebrow text-muted uppercase font-bold tracking-[0.06em] mb-2">
            Tests &amp; packages
          </p>
          <h1 className="text-[28px] sm:text-[32px] font-extrabold text-ink tracking-tight mb-2.5">
            What would you like to book?
          </h1>
          <p className="text-muted text-sm sm:text-body max-w-[580px] leading-relaxed">
            Single tests, full-body checkups, and recurring plans for ongoing conditions. Prices
            vary by lab — compare before you book.
          </p>
        </div>

        {/* Search Input */}
        <div className="mb-6 max-w-[460px]">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tests, organs, symptoms..."
              className="w-full border-[1.5px] border-border rounded-md px-4 py-2.5 pl-10 text-body bg-white outline-none transition placeholder:text-muted2 focus:border-blue600 focus:ring-4 focus:ring-blue100"
              data-testid="catalogue-search-input"
            />
            <Icon name="search" size={16} className="absolute left-3.5 top-3 text-muted2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-muted hover:text-ink text-sm px-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* A refused add is explained rather than silently ignored — the cart
            rules (one collection mode, packages alone) are not guessable. */}
        {lastRejection && (
          <div
            data-testid="cart-rejection"
            role="status"
            className="mb-5 flex items-start gap-3 rounded-lg border border-amber bg-amberBg px-4 py-3"
          >
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-amberDark" />
            <p className="flex-1 text-caption leading-relaxed text-ink">{lastRejection}</p>
            <button
              type="button"
              onClick={dismissRejection}
              aria-label="Dismiss"
              className="shrink-0 text-muted hover:text-ink"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {/* Category Filter Chips — Horizontal Scroll on Mobile, Never Wrap per DESIGN_SPEC §3.4 */}
        <div
          className="flex gap-2.5 overflow-x-auto pb-3 mb-8 no-scrollbar select-none"
          data-testid="category-filter-chips"
        >
          {filterChips.map((chip) => {
            const isActive = activeCategory === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setActiveCategory(chip.key)}
                className={`whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  isActive ? 'scale-100' : 'opacity-85 hover:opacity-100'
                }`}
                data-testid={`chip-${chip.key}`}
              >
                <Chip variant={isActive ? 'blue' : 'grey'}>{chip.label}</Chip>
              </button>
            );
          })}
        </div>

        {/* Content Body: Loading / Error / Empty / Grid Sections */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5" data-testid="loading-skeletons">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <Card key={idx} className="p-5 flex flex-col justify-between h-[210px]">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-28 rounded-pill" />
                    <Skeleton className="h-6 w-16 rounded-pill" />
                  </div>
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <div className="flex justify-between items-baseline pt-4 border-t border-border">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="my-10">
            <EmptyState
              icon="alert"
              title="Unable to load tests"
              body={error}
              ctaText="Try again"
              onCtaClick={() => refetch()}
            />
          </div>
        ) : tests.length === 0 ? (
          <div className="my-10" data-testid="empty-state">
            <EmptyState
              icon="search"
              title="Nothing found in this category"
              body="Try changing your search query or switching to a different category filter."
              ctaText="View all tests"
              onCtaClick={() => {
                setActiveCategory('all');
                setSearchQuery('');
              }}
            />
          </div>
        ) : (
          <div className="space-y-10">
            {sections.map((sec) => {
              const items = tests.filter((t) => t.category === sec.key);
              if (items.length === 0) return null;

              return (
                <div key={sec.key} data-testid={`section-${sec.key}`}>
                  {activeCategory === 'all' && (
                    <h2 className="text-xl font-extrabold text-ink mb-4 tracking-tight">
                      {sec.title}
                    </h2>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                    {items.map((test) => {
                      const discountPct =
                        test.strikePrice && test.strikePrice > test.basePrice
                          ? Math.round((1 - test.basePrice / test.strikePrice) * 100)
                          : 0;

                      return (
                        <Card
                          key={test.slug || test.id}
                          hoverLift
                          onClick={() => handleCardClick(test.slug)}
                          className="p-5 flex flex-col justify-between cursor-pointer border border-border"
                          data-testid={`test-card-${test.slug}`}
                        >
                          <div>
                            {/* Top Chips */}
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              {test.homeCollectionAvailable ? (
                                <Chip variant="green">Home collection</Chip>
                              ) : (
                                <Chip variant="amber">Lab visit only</Chip>
                              )}
                              <Chip variant="grey">{test.sampleType || 'Blood'}</Chip>
                              {discountPct > 0 && (
                                <Chip variant="red">{discountPct}% OFF</Chip>
                              )}
                            </div>

                            {/* Title & Parameters */}
                            <h3 className="font-extrabold text-base text-ink mb-1 line-clamp-1">
                              {test.name}
                            </h3>
                            <p className="text-muted text-caption leading-relaxed line-clamp-2">
                              {test.parametersCount ? `${test.parametersCount} parameters · ` : ''}
                              Reports in {test.turnaroundHrs} hrs
                              {test.frequency ? ` · ${test.frequency}` : ''}
                            </p>
                          </div>

                          {/* Price Footer */}
                          <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
                            <div className="flex items-baseline gap-2">
                              <span className="text-blue600 font-extrabold text-lg">
                                ₹{Number(test.basePrice).toLocaleString('en-IN')}
                              </span>
                              {test.strikePrice && (
                                <span className="text-muted2 line-through text-caption">
                                  ₹{Number(test.strikePrice).toLocaleString('en-IN')}
                                </span>
                              )}
                              {test.frequency && (
                                <span className="text-muted text-xs">/cycle</span>
                              )}
                            </div>

                            {/* stopPropagation, or adding to the cart would
                                also open the test page underneath it. */}
                            <button
                              type="button"
                              data-testid={`add-to-cart-${test.slug}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                add(test);
                              }}
                              disabled={has(test.slug)}
                              className={`flex items-center gap-1.5 rounded-pill border-[1.5px] px-3.5 py-1.5 text-caption font-bold transition ${
                                has(test.slug)
                                  ? 'border-green bg-greenBg text-green cursor-default'
                                  : 'border-blue600 text-blue600 hover:bg-blue600 hover:text-white'
                              }`}
                            >
                              <Icon name={has(test.slug) ? 'check' : 'plus'} size={13} strokeWidth={2.4} />
                              {has(test.slug) ? 'Added' : 'Add'}
                            </button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sticky basket bar. On a phone the navbar cart scrolls out of sight
          almost immediately, and a cart you cannot see is a cart you forget. */}
      {count > 0 && (
        <div className="sticky bottom-0 z-30 border-t border-border bg-white px-5 py-3 shadow-float sm:px-7">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4">
            <div>
              <p className="text-bodySmall font-extrabold text-ink">
                {count} {count === 1 ? 'test' : 'tests'} added
              </p>
              <p className="text-caption text-muted">
                ₹{indicativeTotal.toLocaleString('en-IN')} indicative · final price shown at checkout
              </p>
            </div>
            <button
              type="button"
              data-testid="catalogue-view-cart"
              onClick={openCart}
              className="shrink-0 rounded-pill bg-blue600 px-6 py-2.5 text-bodySmall font-bold text-white transition hover:bg-blue700"
            >
              View cart
            </button>
          </div>
        </div>
      )}

      <WhatsAppFab />
    </div>
  );
}

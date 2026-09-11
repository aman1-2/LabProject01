import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar.jsx';
import WhatsAppFab from '../components/layout/WhatsAppFab.jsx';
import Card from '../components/atoms/Card.jsx';
import Chip from '../components/atoms/Chip.jsx';
import Button from '../components/atoms/Button.jsx';
import EmptyState from '../components/atoms/EmptyState.jsx';
import Skeleton from '../components/atoms/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTestBySlug, useNearbyLabs } from '@pathcare/api';
import { useCart } from '../context/CartContext.jsx';
import Icon from '../components/atoms/Icon.jsx';

export default function TestDetailsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { add, has, openCart, lastRejection } = useCart();

  // Server state comes from TanStack Query hooks in common/api (CONTEXT §7.1).
  const {
    data: test = null,
    isPending: loading,
    isError: isTestError,
    error: testError,
  } = useTestBySlug(slug);

  // Per-lab prices are computed server-side from the live catalogue (CONTEXT
  // §3.2) and only after the test resolves — the hook stays disabled until then.
  // If they cannot be loaded we show no prices rather than deriving them here.
  const {
    data: labsData,
    isError: isLabsError,
    error: labsQueryError,
    refetch: refetchLabs,
  } = useNearbyLabs({ lat: 30.3165, lng: 78.0322, testId: test?.slug });

  const labs = labsData?.labs ?? [];

  const error = isTestError
    ? testError?.status === 404
      ? 'The requested test could not be found in our diagnostic catalogue.'
      : testError?.message || 'We could not load this test just now. Please try again.'
    : null;

  const labsError = isLabsError
    ? labsQueryError?.message || 'We could not load lab prices just now. Please try again.'
    : null;

  // Selected mode: 'home' | 'visit'. Kept in state because the user can change
  // it, but re-derived whenever a different test loads.
  const [selectedMode, setSelectedMode] = useState('home');

  useEffect(() => {
    if (test) {
      // If home collection is not available, default mode to 'visit'
      setSelectedMode(test.homeCollectionAvailable ? 'home' : 'visit');
    }
  }, [test]);

  const discountPct =
    test?.strikePrice && test.strikePrice > test.basePrice
      ? Math.round((1 - test.basePrice / test.strikePrice) * 100)
      : 0;

  const handleContinueToBooking = () => {
    if (!test) return;
    const targetPath = '/book';
    const targetSearch = `?testId=${encodeURIComponent(test.slug)}&mode=${encodeURIComponent(selectedMode)}`;
    if (!isAuthenticated) {
      navigate('/auth', {
        state: {
          from: {
            pathname: targetPath,
            search: targetSearch,
          },
        },
      });
    } else {
      navigate(`${targetPath}${targetSearch}`);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1150px] w-full mx-auto px-5 sm:px-7 py-6 sm:py-9 pb-24 md:pb-12">
        {/* Breadcrumb Back Link */}
        <button
          type="button"
          onClick={() => navigate('/tests')}
          className="text-blue600 font-bold text-sm cursor-pointer hover:underline flex items-center gap-1.5 mb-5 select-none"
          data-testid="back-to-catalogue-btn"
        >
          <span>←</span>
          <span>All tests</span>
        </button>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.85fr] gap-9">
            <div className="space-y-4">
              <Skeleton className="h-7 w-48 rounded-pill" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
            <div>
              <Skeleton className="h-[340px] w-full rounded-xl" />
            </div>
          </div>
        ) : error || !test ? (
          <div className="my-12">
            <EmptyState
              icon="alert"
              title="Test Not Found"
              body={error || 'The diagnostic test you are looking for does not exist or has been retired.'}
              ctaText="Browse all tests"
              onCtaClick={() => navigate('/tests')}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.85fr] gap-8 sm:gap-9 items-start">
            {/* Left Column: Details, Prep Callout, Map & Lab Comparison */}
            <div>
              {/* Chips row */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {test.homeCollectionAvailable ? (
                  <Chip variant="green">Home collection available</Chip>
                ) : (
                  <Chip variant="amber">Lab visit only</Chip>
                )}
                <Chip variant="grey">{test.sampleType || 'Blood'}</Chip>
                {discountPct > 0 && <Chip variant="red">{discountPct}% OFF</Chip>}
              </div>

              {/* Title & Description */}
              <h1 className="text-[26px] sm:text-[32px] font-extrabold text-ink tracking-tight mb-3">
                {test.name}
              </h1>
              <p className="text-muted text-sm sm:text-base leading-relaxed mb-6">
                {test.description}
              </p>

              {/* Parameters List if present */}
              {test.parameters && test.parameters.length > 0 && (
                <div className="mb-6 p-4 rounded-lg bg-white border border-border">
                  <p className="font-extrabold text-xs text-muted uppercase tracking-wider mb-2.5">
                    {test.parametersCount || test.parameters.length} Key Parameters Measured
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {test.parameters.map((param, i) => (
                      <span
                        key={i}
                        className="text-xs font-semibold px-2.5 py-1 rounded-sm bg-chipGreyBg text-ink"
                      >
                        {param}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Amber Prep Instructions Callout matching prototype line 543 */}
              <div
                className="p-4 sm:p-5 rounded-lg bg-amberBg border-none mb-7 flex items-start gap-3.5"
                data-testid="prep-instructions-callout"
              >
                <Icon name="alert" size={16} className="inline-block shrink-0" />
                <div>
                  <p className="font-extrabold text-sm text-amberDark mb-1">
                    Before your test
                  </p>
                  <p className="text-sm text-amberDark leading-relaxed">
                    {test.prepInstructions}
                  </p>
                </div>
              </div>

              {/* Compare Labs Near You Heading */}
              <h2 className="text-lg font-extrabold text-ink mb-3.5 tracking-tight">
                Compare labs near you
              </h2>

              {/* Map Placeholder matching prototype lines 60-63 & 545 */}
              <div
                className="h-[210px] rounded-lg border border-border relative overflow-hidden mb-4 select-none bg-gradient-to-br from-blue100 to-blue50"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(62,99,221,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(62,99,221,0.07) 1px, transparent 1px)',
                  backgroundSize: '34px 34px',
                }}
                data-testid="lab-map-placeholder"
              >
                {/* Numbered Lab Pins */}
                {labs.map((lab, i) => {
                  const leftPos = `${22 + i * 26}%`;
                  const topPos = `${28 + i * 18}%`;
                  return (
                    <div
                      key={lab.id || i}
                      style={{ left: leftPos, top: topPos }}
                      className="absolute w-[34px] h-[34px] rounded-[999px_999px_999px_2px] -rotate-45 flex items-center justify-center text-sm font-extrabold bg-blue600 text-white shadow-card transition"
                    >
                      <i className="rotate-45 not-italic text-xs font-bold">{i + 1}</i>
                    </div>
                  );
                })}

                {/* User Location Pin */}
                <div
                  style={{ left: '62%', top: '60%' }}
                  className="absolute w-[34px] h-[34px] rounded-[999px_999px_999px_2px] -rotate-45 flex items-center justify-center bg-green text-white shadow-card"
                >
                  <Icon name="mapPin" size={14} className="inline-block shrink-0" />
                </div>

                {/* User Location Label Card */}
                <div className="absolute bottom-2.5 left-3 bg-white px-3 py-1.5 rounded-pill text-xs font-bold text-ink shadow-xs border border-border">
                  You · Rajpur Road, Dehradun
                </div>
              </div>

              {/* Lab Rows List */}
              <div className="space-y-2.5" data-testid="lab-comparison-list">
                {labs.length === 0 && (
                  <EmptyState
                    icon={labsError ? '' : ''}
                    title={labsError ? 'Lab prices unavailable' : 'No labs near you yet'}
                    body={
                      labsError ||
                      'Prices for this test at nearby lab centres will appear here once a partner lab covers your area.'
                    }
                    ctaText={labsError ? 'Try again' : undefined}
                    onCtaClick={labsError ? () => refetchLabs() : undefined}
                  />
                )}
                {labs.map((lab, i) => (
                  <div
                    key={lab.id || i}
                    className="p-4 rounded-lg bg-white border border-border flex items-center justify-between gap-3 transition hover:border-blue600"
                    data-testid={`lab-row-${i}`}
                  >
                    <div>
                      <p className="font-bold text-sm text-ink flex items-center gap-2">
                        <span>{lab.name}</span>
                        {lab.accreditation?.nabl && (
                          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-pill bg-blue50 text-blue700">
                            NABL
                          </span>
                        )}
                        {lab.accreditation?.iso && (
                          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-pill bg-chipGreyBg text-muted">
                            ISO
                          </span>
                        )}
                      </p>
                      <p className="text-muted text-xs mt-1">
                        {lab.area} · {lab.distanceKm} km away
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-blue600 text-base">
                        ₹{Number(lab.price).toLocaleString('en-IN')}
                      </p>
                      <p className="text-muted text-[11.5px] mt-0.5">
                        {lab.turnaroundHrs} hr report
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Sticky Buy Panel matching prototype lines 547-557 */}
            <div>
              <Card className="p-6 sticky top-[96px] border border-border shadow-xs">
                {/* Price Display */}
                <div className="flex items-baseline gap-2.5 mb-1">
                  <span className="text-[27px] font-extrabold text-blue600 leading-none">
                    ₹{Number(test.basePrice).toLocaleString('en-IN')}
                  </span>
                  {test.strikePrice && (
                    <span className="text-muted2 line-through text-base">
                      ₹{Number(test.strikePrice).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
                <p className="text-muted text-caption mb-5">
                  {labs.length > 0 ? `Lowest price across ${labs.length} nearby labs` : 'Starting price'}
                  {test.frequency ? ` · billed ${test.frequency.toLowerCase()}` : ''}
                </p>

                {/* Mode Selector Heading */}
                <p className="font-bold text-xs text-ink uppercase tracking-wider mb-2.5">
                  How would you like it done?
                </p>

                {/* Mode 1: Home collection — VISIBLY DISABLED FOR IMAGING TESTS */}
                <div
                  onClick={() => {
                    if (test.homeCollectionAvailable) {
                      setSelectedMode('home');
                    }
                  }}
                  className={`p-3.5 rounded-md mb-2.5 transition-all select-none border ${
                    !test.homeCollectionAvailable
                      ? 'opacity-55 bg-bg border-border cursor-not-allowed'
                      : selectedMode === 'home'
                      ? 'border-blue600 bg-blue50 cursor-pointer'
                      : 'border-border bg-white cursor-pointer hover:border-muted2'
                  }`}
                  data-testid="mode-home-card"
                >
                  <p className="font-bold text-sm text-ink flex items-center gap-1.5">
                    <Icon name="home" size={16} className="inline-block shrink-0" />
                    <span>Home collection</span>
                  </p>
                  <p className="text-muted text-xs mt-1">
                    {test.homeCollectionAvailable
                      ? 'A phlebotomist visits you. Free.'
                      : 'Not available for imaging — needs lab equipment.'}
                  </p>
                </div>

                {/* Mode 2: Visit the lab — always enabled */}
                <div
                  onClick={() => setSelectedMode('visit')}
                  className={`p-3.5 rounded-md mb-5 transition-all cursor-pointer select-none border ${
                    selectedMode === 'visit'
                      ? 'border-blue600 bg-blue50'
                      : 'border-border bg-white hover:border-muted2'
                  }`}
                  data-testid="mode-visit-card"
                >
                  <p className="font-bold text-sm text-ink flex items-center gap-1.5">
                    <Icon name="hospital" size={16} className="inline-block shrink-0" />
                    <span>Visit the lab</span>
                  </p>
                  <p className="text-muted text-xs mt-1">
                    Pick a slot at a centre near you.
                  </p>
                </div>

                {/* Continue CTA Button */}
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleContinueToBooking}
                  data-testid="continue-booking-btn"
                >
                  Continue to booking
                </Button>

                {/* Secondary, because most people booking one test want to book
                    it now — the cart is for the minority building a panel. */}
                <button
                  type="button"
                  data-testid="detail-add-to-cart"
                  onClick={() => (has(test.slug) ? openCart() : add(test))}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-blue600 py-3 text-body font-bold text-blue600 transition hover:bg-blue50"
                >
                  <Icon name={has(test.slug) ? 'cart' : 'plus'} size={16} strokeWidth={2.2} />
                  {has(test.slug) ? 'In your cart — view' : 'Add to cart'}
                </button>

                {lastRejection && (
                  <p
                    data-testid="detail-cart-rejection"
                    role="status"
                    className="mt-2.5 rounded-lg border border-amber bg-amberBg px-3 py-2 text-caption leading-relaxed text-ink"
                  >
                    {lastRejection}
                  </p>
                )}

                <p className="text-muted2 text-xs text-center mt-3">
                  Your lab will include a written summary with your report.
                </p>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Sticky Bottom Bar per DESIGN_SPEC §3.5 (Visible only on mobile screens < 768px) */}
      {test && (
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border p-3.5 px-5 shadow-card flex items-center justify-between"
          data-testid="mobile-sticky-bar"
        >
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-blue600">
                ₹{Number(test.basePrice).toLocaleString('en-IN')}
              </span>
              {test.strikePrice && (
                <span className="text-muted2 line-through text-xs">
                  ₹{Number(test.strikePrice).toLocaleString('en-IN')}
                </span>
              )}
            </div>
            <p className="text-muted text-[11px]">
              {selectedMode === 'home' ? 'Home collection' : 'Visit lab'}
            </p>
          </div>

          <Button
            variant="primary"
            size="small"
            onClick={handleContinueToBooking}
            data-testid="mobile-continue-btn"
          >
            Continue
          </Button>
        </div>
      )}

      <WhatsAppFab />
    </div>
  );
}

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import TestDetailsPage from '../src/pages/TestDetailsPage.jsx';
import { fetchNearbyLabs } from '@pathcare/api';

// The page carries no bundled catalogue and computes no prices, so both the test
// detail and the per-lab prices are stubbed at the API boundary. The lab prices
// below are what the server would return after applying each lab's
// priceMultiplier to a ₹299 base — the page must render them verbatim.
const { TESTS, LAB_RESPONSE } = vi.hoisted(() => ({
  TESTS: {
    'complete-blood-count-cbc': {
      id: 't1',
      slug: 'complete-blood-count-cbc',
      name: 'Complete Blood Count (CBC)',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 299,
      turnaroundHrs: 6,
      parametersCount: 24,
      parameters: ['Hemoglobin', 'RBC Count', 'Platelet Count'],
      prepInstructions: 'No fasting required.',
      description: 'Measures red cells, white cells, haemoglobin and platelets.',
    },
    'ultrasound-whole-abdomen': {
      id: 't3',
      slug: 'ultrasound-whole-abdomen',
      name: 'Ultrasound — Whole Abdomen',
      category: 'imaging',
      sampleType: 'Imaging',
      homeCollectionAvailable: false,
      basePrice: 1200,
      turnaroundHrs: 4,
      parametersCount: 0,
      parameters: ['Liver', 'Gallbladder', 'Kidneys'],
      prepInstructions: '6-hour fasting. Drink 1L water and hold a full bladder.',
      description: 'Ultrasound imaging of the abdominal organs.',
    },
  },
  LAB_RESPONSE: {
    labs: [
      {
        id: 'l3',
        name: 'Himalaya Medicare',
        area: 'Clock Tower',
        distanceKm: 0.4,
        price: 254,
        turnaroundHrs: 12,
        accreditation: { nabl: true, iso: false },
      },
      {
        id: 'l1',
        name: 'Sunrise Diagnostics',
        area: 'Rajpur Road',
        distanceKm: 2.7,
        price: 299,
        turnaroundHrs: 6,
        accreditation: { nabl: true, iso: true },
      },
      {
        id: 'l2',
        name: 'Doon Path Labs',
        area: 'Ballupur Chowk',
        distanceKm: 3.0,
        price: 275,
        turnaroundHrs: 8,
        accreditation: { nabl: true, iso: true },
      },
    ],
  },
}));

// Mocked at the HTTP boundary rather than at '@pathcare/api', so the real
// TanStack Query hooks in common/api run under test.
vi.mock('../../common/api/src/client.js', () => ({
  createApiClient: vi.fn(() => ({})),
  apiClient: {},
  fetchTests: vi.fn(),
  fetchTestBySlug: vi.fn(async (slug) => {
    const found = TESTS[slug];
    if (!found) return Promise.reject({ message: 'Test not found', status: 404 });
    return found;
  }),
  fetchNearbyLabs: vi.fn(async () => LAB_RESPONSE),
}));

function renderTestDetailsPage(slug) {
  // A fresh client per test so nothing is cached across tests.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/tests/${slug}`]}>
        <AuthProvider>
          <CartProvider>
          <Routes>
            <Route path="/tests/:slug" element={<TestDetailsPage />} />
          </Routes>
        </CartProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TestDetailsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchNearbyLabs.mockResolvedValue(LAB_RESPONSE);
  });

  it('renders blood test with active selectable Home Collection mode and prep callout', async () => {
    renderTestDetailsPage('complete-blood-count-cbc');

    await waitFor(() => {
      expect(screen.getByText(/Complete Blood Count \(CBC\)/i)).toBeInTheDocument();
    });

    // Verify amber prep callout
    expect(screen.getByTestId('prep-instructions-callout')).toBeInTheDocument();
    expect(screen.getByText(/Before your test/i)).toBeInTheDocument();
    expect(screen.getByText(/No fasting required/i)).toBeInTheDocument();

    // Verify Home Collection mode is enabled and active
    const homeCard = screen.getByTestId('mode-home-card');
    expect(homeCard).not.toHaveClass('cursor-not-allowed');
    expect(homeCard).toHaveTextContent(/A phlebotomist visits you\. Free\./i);

    // Verify Visit Lab mode can be switched to
    const visitCard = screen.getByTestId('mode-visit-card');
    fireEvent.click(visitCard);
    expect(visitCard).toHaveClass('border-blue600');

    // Switch back to Home collection
    fireEvent.click(homeCard);
    expect(homeCard).toHaveClass('border-blue600');
  });

  it('strictly renders Home Collection visibly disabled with explanation for imaging tests (MRI / Ultrasound / X-Ray)', async () => {
    renderTestDetailsPage('ultrasound-whole-abdomen');

    await waitFor(() => {
      expect(screen.getByText(/Ultrasound — Whole Abdomen/i)).toBeInTheDocument();
    });

    // Verify Lab visit only chip
    expect(screen.getByText(/Lab visit only/i)).toBeInTheDocument();

    // Verify Home collection mode is VISIBLY DISABLED with explicit reason shown
    const homeCard = screen.getByTestId('mode-home-card');
    expect(homeCard).toHaveClass('cursor-not-allowed');
    expect(homeCard).toHaveClass('opacity-55');
    expect(homeCard).toHaveTextContent(/Not available for imaging — needs lab equipment\./i);

    // Verify default active mode is Visit Lab
    const visitCard = screen.getByTestId('mode-visit-card');
    expect(visitCard).toHaveClass('border-blue600');

    // Clicking homeCard should NOT make it active
    fireEvent.click(homeCard);
    expect(homeCard).not.toHaveClass('border-blue600');
    expect(visitCard).toHaveClass('border-blue600');
  });

  it('renders the per-lab prices exactly as the server returned them', async () => {
    renderTestDetailsPage('complete-blood-count-cbc');

    await waitFor(() => {
      expect(screen.getByTestId('lab-comparison-list')).toBeInTheDocument();
    });

    expect(screen.getByText(/Sunrise Diagnostics/i)).toBeInTheDocument();
    expect(screen.getByText(/Doon Path Labs/i)).toBeInTheDocument();
    expect(screen.getByText(/Himalaya Medicare/i)).toBeInTheDocument();

    // The same test costs different amounts at different labs, and every one of
    // those amounts came from the API — none is derived in the browser.
    expect(screen.getByText('₹254')).toBeInTheDocument();
    expect(screen.getByText('₹275')).toBeInTheDocument();
    expect(screen.getAllByText('₹299').length).toBeGreaterThan(0);

    // Distances are the server's, not a hardcoded ordering
    expect(screen.getByText(/0\.4 km away/i)).toBeInTheDocument();
    expect(screen.getByText(/2\.7 km away/i)).toBeInTheDocument();

    expect(screen.getByTestId('lab-map-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-sticky-bar')).toBeInTheDocument();
  });

  it('shows no prices at all when lab pricing cannot be loaded', async () => {
    fetchNearbyLabs.mockRejectedValueOnce({ message: 'Lab pricing service unavailable' });

    renderTestDetailsPage('complete-blood-count-cbc');

    await waitFor(() => {
      expect(screen.getByText(/Lab prices unavailable/i)).toBeInTheDocument();
    });

    // No lab price is invented in the browser to fill the gap
    expect(screen.queryByText('₹254')).not.toBeInTheDocument();
    expect(screen.queryByText('₹275')).not.toBeInTheDocument();
    expect(screen.queryByText(/km away/i)).not.toBeInTheDocument();
  });

  it('shows an error state when the test itself cannot be loaded', async () => {
    renderTestDetailsPage('no-such-test');

    await waitFor(() => {
      expect(screen.getByText(/Test Not Found/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mode-home-card')).not.toBeInTheDocument();
  });
});

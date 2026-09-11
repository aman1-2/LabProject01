import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import CataloguePage from '../src/pages/CataloguePage.jsx';
import { fetchTests } from '@pathcare/api';

// Catalogue data comes from the API only — the page has no bundled copy to fall
// back on — so these tests stub the API layer and assert the page renders what
// the server returned, and asks the server for the right slice of the catalogue.
const { CATALOGUE } = vi.hoisted(() => ({
  CATALOGUE: [
    {
      id: 't1',
      slug: 'complete-blood-count-cbc',
      name: 'Complete Blood Count (CBC)',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 299,
      turnaroundHrs: 6,
      parametersCount: 24,
      description: 'Measures red cells, white cells, haemoglobin and platelets.',
      tags: ['fever', 'infection'],
    },
    {
      id: 't2',
      slug: 'lipid-profile',
      name: 'Lipid Profile',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 499,
      turnaroundHrs: 6,
      parametersCount: 10,
      description: 'Total cholesterol, HDL, LDL and triglycerides.',
      tags: ['heart', 'cholesterol'],
    },
    {
      id: 't3',
      slug: 'ultrasound-whole-abdomen',
      name: 'Ultrasound — Whole Abdomen',
      category: 'imaging',
      sampleType: 'Imaging',
      homeCollectionAvailable: false,
      basePrice: 1200,
      turnaroundHrs: 4,
      parametersCount: 0,
      description: 'Ultrasound imaging of the abdominal organs.',
      tags: ['imaging', 'scan'],
    },
  ],
}));

// Mocked at the HTTP boundary rather than at '@pathcare/api', so the real
// TanStack Query hooks in common/api run under test. Stands in for the server's
// filtering, so the assertions below only pass when the page sends the right
// category/search to the API.
vi.mock('../../common/api/src/client.js', () => ({
  createApiClient: vi.fn(() => ({})),
  apiClient: {},
  fetchTestBySlug: vi.fn(),
  fetchNearbyLabs: vi.fn(),
  fetchTests: vi.fn(async ({ category = 'all', search = '' } = {}) => {
    let items = CATALOGUE;
    if (category !== 'all') items = items.filter((t) => t.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return { items, pagination: { total: items.length, page: 1, limit: 100, totalPages: 1 } };
  }),
}));

function renderCataloguePage() {
  // A fresh client per test so nothing is cached across tests.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
          <CataloguePage />
        </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('CataloguePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders catalogue header, search input, and category filter chips', () => {
    renderCataloguePage();

    expect(screen.getByText(/What would you like to book\?/i)).toBeInTheDocument();
    expect(screen.getByTestId('catalogue-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('chip-package')).toBeInTheDocument();
    expect(screen.getByTestId('chip-single')).toBeInTheDocument();
    expect(screen.getByTestId('chip-imaging')).toBeInTheDocument();
    expect(screen.getByTestId('chip-plan')).toBeInTheDocument();
  });

  it('renders test cards from the API with availability, turnaround, and price', async () => {
    renderCataloguePage();

    await waitFor(() => {
      expect(screen.getByText(/Complete Blood Count \(CBC\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Ultrasound — Whole Abdomen/i)).toBeInTheDocument();

    // Home-collection availability is driven by the server field, not by category
    expect(screen.getAllByText(/Home collection/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Lab visit only/i).length).toBeGreaterThan(0);

    // Prices are rendered exactly as the server returned them
    expect(screen.getByText('₹299')).toBeInTheDocument();
    expect(screen.getByText('₹1,200')).toBeInTheDocument();
  });

  it('asks the API for the selected category and renders only those tests', async () => {
    renderCataloguePage();
    await waitFor(() => expect(screen.getByText(/Complete Blood Count/i)).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('chip-imaging'));

    await waitFor(() => {
      expect(fetchTests).toHaveBeenCalledWith(expect.objectContaining({ category: 'imaging' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Ultrasound — Whole Abdomen/i)).toBeInTheDocument();
      expect(screen.queryByText(/Complete Blood Count \(CBC\)/i)).not.toBeInTheDocument();
    });
  });

  it('sends the search query to the API and renders the matching tests', async () => {
    renderCataloguePage();
    await waitFor(() => expect(screen.getByText(/Complete Blood Count/i)).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('catalogue-search-input'), {
      target: { value: 'Lipid' },
    });

    await waitFor(() => {
      expect(fetchTests).toHaveBeenCalledWith(expect.objectContaining({ search: 'Lipid' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Lipid Profile/i)).toBeInTheDocument();
      expect(screen.queryByText(/Complete Blood Count/i)).not.toBeInTheDocument();
    });
  });

  it('shows an error state instead of stale data when the catalogue cannot be loaded', async () => {
    fetchTests.mockRejectedValueOnce({ message: 'Network unreachable', code: 'UNKNOWN_ERROR' });

    renderCataloguePage();

    await waitFor(() => {
      expect(screen.getByText(/Unable to load tests/i)).toBeInTheDocument();
    });
    // Critically: no catalogue content is rendered from a bundled copy
    expect(screen.queryByText(/Complete Blood Count/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ultrasound/i)).not.toBeInTheDocument();
  });
});

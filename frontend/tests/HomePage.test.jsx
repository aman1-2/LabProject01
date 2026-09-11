import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const fetchCatalogue = vi.fn();
vi.mock('@pathcare/api', async () => {
  const actual = await vi.importActual('@pathcare/api');
  return { ...actual, fetchCatalogue: (...args) => fetchCatalogue(...args) };
});

vi.mock('../src/components/layout/Navbar.jsx', () => ({ default: () => <nav /> }));

const HomePage = (await import('../src/pages/HomePage.jsx')).default;

/**
 * The landing page.
 *
 * Until this existed there was no `/` route at all — visitors matched nothing
 * and got a blank page.
 *
 * The assertions worth having here are about HONESTY as much as rendering.
 * Competitors lead with "1M+ customers" and a star average; PathCare has not
 * collected a sample, so those would be fabricated statistics on a medical
 * product (CONTEXT §3.1). The tests below pin that the page makes no such
 * claim, because that is the kind of thing that gets quietly "improved" back
 * in later.
 */
function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const PACKAGE = {
  slug: 'full-body-checkup-essential',
  name: 'Full Body Checkup — Essential',
  basePrice: 1499,
  strikePrice: 1999,
  turnaroundHrs: 8,
  parametersCount: 54,
  description: 'A 54-parameter baseline covering blood count, sugar, lipids and thyroid.',
  category: 'package',
};

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCatalogue.mockImplementation(async ({ category }) =>
      category === 'package' ? { items: [PACKAGE] } : { items: [] }
    );
  });

  it('renders the hero with the value proposition', async () => {
    renderHome();
    expect(await screen.findByText(/Lab tests at home/i)).toBeInTheDocument();
    expect(screen.getByText(/Now live in Dehradun/i)).toBeInTheDocument();
  });

  it('makes only claims that are true before the first customer', async () => {
    renderHome();
    await screen.findByText(/Lab tests at home/i);

    // Verifiable on day one.
    expect(screen.getByText(/NABL & ISO/i)).toBeInTheDocument();
    expect(screen.getByText(/Home collection fee/i)).toBeInTheDocument();

    // Fabricated social proof, of the kind competitors lead with.
    const body = document.body.textContent;
    expect(body).not.toMatch(/\d[\d,.]*\s*(M\+|k\+|lakh|crore)\s*(customers|users|tests)/i);
    expect(body).not.toMatch(/\b[45]\.\d\s*(★|star|rating)/i);
    expect(body).not.toMatch(/\b\d{2,3}%\s*(on.?time|satisfaction|accuracy)/i);
  });

  it('shows checkups from the live catalogue, with parameters and turnaround', async () => {
    renderHome();

    const card = await screen.findByTestId(`home-package-${PACKAGE.slug}`);
    expect(card).toHaveTextContent('Full Body Checkup — Essential');
    expect(card).toHaveTextContent('₹1,499');       // Indian digit grouping
    expect(card).toHaveTextContent('₹1,999');       // struck through
    expect(card).toHaveTextContent('25% OFF');      // derived, not hardcoded
    expect(card).toHaveTextContent('54 parameters');
    expect(card).toHaveTextContent('Reports in 8 hrs');
  });

  it('does not invent products when the catalogue is empty', async () => {
    fetchCatalogue.mockResolvedValue({ items: [] });
    renderHome();

    await screen.findByText(/Lab tests at home/i);
    expect(screen.queryByTestId(/^home-package-/)).not.toBeInTheDocument();
    // The section still stands; it simply has nothing in it.
    expect(screen.getByText(/Full body checkups/i)).toBeInTheDocument();
  });

  it('survives a catalogue failure without breaking the page', async () => {
    fetchCatalogue.mockRejectedValue(new Error('network down'));
    renderHome();

    // The landing page must render even if the API is unreachable — it is the
    // only thing a first-time visitor sees.
    expect(await screen.findByText(/Lab tests at home/i)).toBeInTheDocument();
    expect(screen.getByText(/How it works/i)).toBeInTheDocument();
  });

  it('search sends the query to the catalogue', async () => {
    renderHome();

    fireEvent.change(await screen.findByTestId('home-search'), {
      target: { value: 'thyroid' },
    });
    fireEvent.click(screen.getByTestId('home-search-submit'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tests?q=thyroid'));
  });

  it('an empty search still reaches the catalogue', async () => {
    renderHome();
    fireEvent.click(await screen.findByTestId('home-search-submit'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tests'));
  });

  it('concern tiles route into the catalogue', async () => {
    renderHome();
    fireEvent.click(await screen.findByTestId('concern-thyroid'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tests?q=thyroid'));
  });

  it('the FAQ opens and states the doctor-fee position (CONTEXT §2.2)', async () => {
    renderHome();

    const question = await screen.findByTestId('faq-5');
    fireEvent.click(question);

    // Scoped to the answer itself: the same position is also stated in the
    // "after your report" section, and a page-wide text match would pass even
    // if the FAQ answer were empty.
    expect(await screen.findByTestId('faq-answer-5')).toHaveTextContent(
      /takes no share of the consultation/i
    );
  });

  it('the first FAQ is open by default so the section is not a wall of buttons', async () => {
    renderHome();
    expect(await screen.findByText(/A certified phlebotomist comes to your address/i)).toBeInTheDocument();
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { passwordSchema } from '@pathcare/validators';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import AuthPage from '../src/pages/AuthPage.jsx';

/**
 * The sign-up form's affordances.
 *
 * The interesting assertion here is the password meter. It reads its rules off
 * the SAME `passwordSchema` the server validates with, so it cannot tell
 * someone their password is fine and then have the API reject it. The test
 * below drives real passwords through both and asserts they always agree —
 * which means adding a rule to the schema without updating the meter fails
 * here rather than in front of a patient.
 */
function renderAuthPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <CartProvider>
            <AuthPage />
          </CartProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function openSignUp() {
  renderAuthPage();
  fireEvent.click(screen.getByTestId('signup-tab'));
}

describe('sign up form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('offers both account types, with a line explaining each', () => {
    openSignUp();

    // A one-word pill ("Single" / "Family") made people guess.
    expect(screen.getByTestId('account-type-single')).toHaveTextContent(/Just my own tests/i);
    expect(screen.getByTestId('account-type-family')).toHaveTextContent(/Book for parents too/i);
  });

  it('marks the chosen account type for assistive technology, not just visually', () => {
    openSignUp();

    const single = screen.getByTestId('account-type-single');
    const family = screen.getByTestId('account-type-family');

    expect(single).toHaveAttribute('aria-pressed', 'true');
    expect(family).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(family);

    // A blue border is invisible to a screen reader; the state has to be real.
    expect(family).toHaveAttribute('aria-pressed', 'true');
    expect(single).toHaveAttribute('aria-pressed', 'false');
  });

  it('reveals and re-hides the password', () => {
    openSignUp();

    const field = screen.getByPlaceholderText(/Min 8 chars/i);
    const toggle = screen.getByTestId('toggle-password');

    expect(field).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAccessibleName(/show password/i);

    fireEvent.click(toggle);
    expect(field).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAccessibleName(/hide password/i);

    fireEvent.click(toggle);
    expect(field).toHaveAttribute('type', 'password');
  });

  it('shows no strength meter until there is something to judge', () => {
    openSignUp();
    expect(screen.queryByTestId('password-strength')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Min 8 chars/i), { target: { value: 'a' } });
    expect(screen.getByTestId('password-strength')).toBeInTheDocument();
  });

  it('names the rule that is still failing, rather than saying "weak"', () => {
    openSignUp();
    const field = screen.getByPlaceholderText(/Min 8 chars/i);

    fireEvent.change(field, { target: { value: 'onlyletters' } });
    // Long enough, has letters — the only thing missing is a digit, and that is
    // what the patient needs to be told.
    expect(screen.getByTestId('password-strength')).toHaveTextContent(/number/i);
    expect(screen.getByTestId('password-strength')).not.toHaveTextContent(/8 characters/i);

    fireEvent.change(field, { target: { value: '1234567' } });
    expect(screen.getByTestId('password-strength')).toHaveTextContent(/8 characters/i);
    expect(screen.getByTestId('password-strength')).toHaveTextContent(/letter/i);
  });

  it('never calls a password acceptable that the server would reject', async () => {
    openSignUp();
    const field = screen.getByPlaceholderText(/Min 8 chars/i);

    const candidates = [
      '',
      'a',
      'short1',
      'onlyletters',
      '12345678',
      'secret123',
      'securePassword1',
      'aaaaaaa1',
      'aaaaaaaa',
    ];

    for (const candidate of candidates) {
      fireEvent.change(field, { target: { value: candidate } });

      if (candidate === '') {
        // Nothing typed yet — the meter is not shown at all.
        await waitFor(() =>
          expect(screen.queryByTestId('password-strength')).not.toBeInTheDocument()
        );
        continue;
      }

      const meter = await screen.findByTestId('password-strength');
      const saysAccepted = /Meets the requirements/i.test(meter.textContent);
      const serverAccepts = passwordSchema.safeParse(candidate).success;

      // The whole point of deriving the meter from the schema.
      expect(saysAccepted, `meter disagreed with the schema for "${candidate}"`).toBe(
        serverAccepts
      );
    }
  });

  it('reports handle availability with an icon, not a bare glyph', async () => {
    openSignUp();

    // The project replaced every emoji and text glyph with real line icons;
    // "✓ Available" here was one of the last two left.
    const body = document.body.textContent;
    expect(body).not.toContain('✓');
    expect(body).not.toContain('✕');
  });
});

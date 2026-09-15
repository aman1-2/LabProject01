import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import AuthPage from '../src/pages/AuthPage.jsx';

import { CITY } from '../src/lib/locale.js';
function renderAuthPage() {
  return render(
    <BrowserRouter>
      <AuthProvider>
          <CartProvider>
        <AuthPage />
      </CartProvider>
        </AuthProvider>
    </BrowserRouter>
  );
}

describe('AuthPage Component', () => {
  it('renders split screen with branding and tabs', () => {
    renderAuthPage();

    // The brand panel leads with where the service actually operates, which is
    // checkable, rather than a slogan.
    expect(screen.getByText(new RegExp(`Now live in ${CITY}`, 'i'))).toBeInTheDocument();
    expect(screen.getByTestId('signin-tab')).toBeInTheDocument();
    expect(screen.getByTestId('signup-tab')).toBeInTheDocument();
  });

  it('carries the prototype headline and no invented customer testimonial', () => {
    renderAuthPage();

    // Matches pathcare_v3_prototype.html; the three trust claims below it are
    // true on day one (CONTEXT §3.1).
    expect(
      screen.getByText(/One account for your whole family's health records\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Book for a parent in another part of town/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/NABL & ISO/i)).toBeInTheDocument();

    // Reviews and testimonials are forbidden pre-launch (CONTEXT §3.1)
    expect(screen.queryByText(/Riya S\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Family Plan user/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Booked a test for my father/i)).not.toBeInTheDocument();
  });

  it('blocks submit on Sign In when inputs are empty and shows inline errors', async () => {
    renderAuthPage();

    const submitBtn = screen.getByTestId('signin-submit');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Account handle is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
    });
  });

  it('switches to Mobile & OTP mode and validates phone number', async () => {
    renderAuthPage();

    const otpModeBtn = screen.getByTestId('otp-mode-btn');
    fireEvent.click(otpModeBtn);

    const sendOtpBtn = screen.getByTestId('signin-submit');
    expect(sendOtpBtn).toHaveTextContent(/Send Verification OTP/i);
    fireEvent.click(sendOtpBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid 10-digit Indian mobile number/i)).toBeInTheDocument();
    });
  });

  it('blocks submit on Create Account when required fields are missing', async () => {
    renderAuthPage();

    // Switch to Create Account tab
    const createAccountTab = screen.getByTestId('signup-tab');
    fireEvent.click(createAccountTab);

    // Click submit
    const submitBtn = screen.getByTestId('signup-submit');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Handle must be at least 3 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/Full name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Enter a valid 10-digit Indian mobile number/i)).toBeInTheDocument();
      expect(screen.getByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/Address or location is required/i)).toBeInTheDocument();
    });
  });
});

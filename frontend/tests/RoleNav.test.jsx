import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toolsForRole, isStaff, roleLabel } from '../src/lib/roleNav.js';
import { RoleProtectedRoute } from '../src/components/auth/ProtectedRoute.jsx';
import UserButton from '../src/components/atoms/UserButton.jsx';
import Navbar from '../src/components/layout/Navbar.jsx';

/**
 * Role-aware navigation.
 *
 * Two separate things are checked here, and the distinction matters:
 *
 *   1. What the interface OFFERS. A patient was being shown a "For Doctors"
 *      link into a dashboard they cannot use.
 *   2. What the interface ENFORCES. `RoleProtectedRoute` existed but was used
 *      by no route — every staff page sat behind a plain signed-in check, so a
 *      patient who typed /admin got the console shell. The API refused the
 *      data, but the tooling was on screen.
 *
 * Hiding a link is not access control, so the guard is tested on its own.
 */

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

let currentUser = null;
vi.mock('../src/context/AuthContext.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: () => ({
      user: currentUser,
      isAuthenticated: Boolean(currentUser),
      isLoading: false,
      logout: vi.fn(),
    }),
  };
});

vi.mock('../src/context/CartContext.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useCart: () => ({ count: 0, isOpen: false, openCart: vi.fn(), closeCart: vi.fn() }),
  };
});

const asUser = (role) => ({ name: 'Test Person', accountHandle: 'test_person', role });

function renderNavbar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('roleNav', () => {
  it('gives a patient no staff tools', () => {
    expect(toolsForRole('patient')).toEqual([]);
    expect(isStaff('patient')).toBe(false);
    // Unknown or absent roles must fail closed, not throw or leak a console.
    expect(toolsForRole(undefined)).toEqual([]);
    expect(toolsForRole('not_a_role')).toEqual([]);
  });

  it('gives each staff role its own console', () => {
    expect(toolsForRole('doctor').map((t) => t.to)).toEqual(['/doctor/dashboard']);
    expect(toolsForRole('lab_admin').map((t) => t.to)).toEqual(['/lab/console']);
    // A super admin is allowed the doctor dashboard by the API too, so the nav
    // offers it rather than hiding something they are authorised for.
    expect(toolsForRole('super_admin').map((t) => t.to)).toEqual([
      '/admin',
      '/doctor/dashboard',
    ]);
  });

  it('labels staff accounts but not patients', () => {
    expect(roleLabel('doctor')).toBe('Doctor');
    expect(roleLabel('lab_admin')).toBe('Lab admin');
    expect(roleLabel('super_admin')).toBe('Admin');
    // "Patient" beside your own name is noise on a product where that is the
    // default.
    expect(roleLabel('patient')).toBeNull();
  });
});

describe('the navbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = null;
  });

  it('offers no staff link to a signed-out visitor', () => {
    renderNavbar();
    expect(screen.queryByTestId(/^nav-role-/)).not.toBeInTheDocument();
  });

  it('offers no staff link to a patient', () => {
    currentUser = asUser('patient');
    renderNavbar();

    // The specific regression: "For Doctors" pointed every visitor at the
    // doctor dashboard.
    expect(screen.queryByText(/For Doctors/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^nav-role-/)).not.toBeInTheDocument();
  });

  it('keeps the patient-facing links for everyone, staff included', () => {
    currentUser = asUser('lab_admin');
    renderNavbar();

    // Staff are people too: a lab admin can still book a test for themselves.
    expect(screen.getByTestId('nav-tests-link')).toBeInTheDocument();
    expect(screen.getByTestId('nav-doctors-link')).toBeInTheDocument();
    expect(screen.getByTestId('nav-track-link')).toBeInTheDocument();
  });

  it.each([
    ['doctor', 'nav-role-doctor-dashboard', '/doctor/dashboard'],
    ['lab_admin', 'nav-role-lab-console', '/lab/console'],
    ['super_admin', 'nav-role-admin-console', '/admin'],
  ])('shows %s their console', (role, testId, href) => {
    currentUser = asUser(role);
    renderNavbar();

    const link = screen.getByTestId(testId);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', href);
  });

  it('does not show one role another role’s console', () => {
    currentUser = asUser('doctor');
    renderNavbar();

    expect(screen.getByTestId('nav-role-doctor-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-role-admin-console')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-role-lab-console')).not.toBeInTheDocument();
  });
});

describe('the account menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function openMenu(role) {
    currentUser = asUser(role);
    render(
      <MemoryRouter>
        <UserButton />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('nav-user-button'));
  }

  it('shows a patient no staff section and no role badge', () => {
    openMenu('patient');
    expect(screen.queryByTestId('user-menu-role-tools')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-menu-role')).not.toBeInTheDocument();
  });

  it('shows staff their console and names their role', () => {
    openMenu('lab_admin');

    expect(screen.getByTestId('user-menu-role-tools')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu-role')).toHaveTextContent('Lab admin');
    expect(screen.getByTestId('user-menu-lab-console')).toBeInTheDocument();
  });

  it('routes to the console from the menu', () => {
    openMenu('super_admin');
    fireEvent.click(screen.getByTestId('user-menu-admin-console'));
    expect(navigate).toHaveBeenCalledWith('/admin');
  });

  it('keeps the ordinary account links for staff', () => {
    openMenu('doctor');
    // A doctor still has their own profile and their own bookings.
    expect(screen.getByTestId('user-menu-profile')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu-logout')).toBeInTheDocument();
  });
});

describe('RoleProtectedRoute — the part that is actually access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderGuarded(role, allowedRoles) {
    currentUser = role ? asUser(role) : null;
    return render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RoleProtectedRoute allowedRoles={allowedRoles}>
                <div data-testid="console">the console</div>
              </RoleProtectedRoute>
            }
          />
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/auth" element={<div data-testid="auth">sign in</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('lets the right role through', () => {
    renderGuarded('super_admin', ['super_admin']);
    expect(screen.getByTestId('console')).toBeInTheDocument();
  });

  it('turns a patient away from a console they are signed in for', () => {
    renderGuarded('patient', ['super_admin']);

    // Signed in, but not this. Before this guard was wired up the patient got
    // the console shell.
    expect(screen.queryByTestId('console')).not.toBeInTheDocument();
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('turns one staff role away from another staff role’s console', () => {
    renderGuarded('lab_admin', ['super_admin']);
    expect(screen.queryByTestId('console')).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign in, not to the home page', () => {
    renderGuarded(null, ['super_admin']);
    expect(screen.getByTestId('auth')).toBeInTheDocument();
  });
});

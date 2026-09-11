import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage, getInitials, getAvatarColor } from '../src/components/ui/avatar.jsx';
import UserButton from '../src/components/atoms/UserButton.jsx';

/**
 * The avatar and the account menu.
 *
 * Ported from the Slack project's `ui/avatar` + `atoms/UserButton`, so the
 * behaviours worth pinning are the ones the Base UI / Radix primitives were
 * providing there and that we now own: the image-to-initials fallback, and the
 * menu's dismissal and focus handling.
 */

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const logout = vi.fn();
let currentUser = null;

vi.mock('../src/context/AuthContext.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useAuth: () => ({ user: currentUser, logout }) };
});

function renderUserButton() {
  return render(
    <MemoryRouter>
      <UserButton />
    </MemoryRouter>
  );
}

describe('Avatar', () => {
  it('derives up to two initials, and never renders empty', () => {
    expect(getInitials('Aman Pratap Singh')).toBe('AP');
    expect(getInitials('Cher')).toBe('C');
    expect(getInitials('  ')).toBe('U');
    expect(getInitials('')).toBe('U');
  });

  it('gives the same person the same colour every time', () => {
    // The navbar and the profile header must not show one patient as two
    // different colours, which is why this is derived and not random.
    expect(getAvatarColor('Aman Pratap Singh')).toBe(getAvatarColor('Aman Pratap Singh'));
    expect(getAvatarColor('Aman')).not.toBe(getAvatarColor('Zoya'));
  });

  it('shows initials when there is no image', () => {
    render(
      <Avatar>
        <AvatarImage src={undefined} alt="" />
        <AvatarFallback name="Aman Pratap Singh" />
      </Avatar>
    );

    expect(screen.getByText('AP')).toBeInTheDocument();
    // An <img> with no src makes the browser re-request the current page.
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('falls back to initials when the image fails to load', () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.test/broken.png" alt="" />
        <AvatarFallback name="Aman Pratap Singh" />
      </Avatar>
    );

    const image = document.querySelector('img');
    fireEvent.load(image);
    expect(screen.queryByText('AP')).not.toBeInTheDocument();

    // A broken image must show initials, not a broken-image glyph where
    // someone's face should be.
    fireEvent.error(image);
    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('carries the size through as a data attribute', () => {
    const { rerender } = render(<Avatar data-testid="a" size="sm" />);
    expect(screen.getByTestId('a')).toHaveAttribute('data-size', 'sm');
    expect(screen.getByTestId('a').className).toContain('size-6');

    rerender(<Avatar data-testid="a" size="lg" />);
    expect(screen.getByTestId('a')).toHaveAttribute('data-size', 'lg');
    expect(screen.getByTestId('a').className).toContain('size-10');
  });

  it('lets a caller override the base size, which is why cn merges', () => {
    render(<Avatar data-testid="a" className="size-16" />);
    const className = screen.getByTestId('a').className;

    // Both `size-8` and `size-16` in the attribute would leave the winner up
    // to stylesheet order rather than the caller.
    expect(className).toContain('size-16');
    expect(className).not.toContain('size-8');
  });
});

describe('UserButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = {
      name: 'Aman Pratap Singh',
      accountHandle: 'aman_patient',
      accountType: 'family',
    };
  });

  it('renders nothing when signed out', () => {
    currentUser = null;
    const { container } = renderUserButton();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows initials, and names the account for assistive technology', () => {
    renderUserButton();

    const trigger = screen.getByTestId('nav-user-button');
    expect(within(trigger).getByText('AP')).toBeInTheDocument();
    // The name is no longer on screen, so an unlabelled circle would be all a
    // screen reader got.
    expect(trigger).toHaveAccessibleName(/Aman Pratap Singh/);
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('opens and closes the menu, reporting its state', () => {
    renderUserButton();
    const trigger = screen.getByTestId('nav-user-button');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('nav-user-menu')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('nav-user-menu')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByTestId('nav-user-menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    renderUserButton();
    const trigger = screen.getByTestId('nav-user-button');
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('nav-user-menu')).not.toBeInTheDocument();
    // Otherwise a keyboard user is dropped back at the top of the document.
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when you click outside it', () => {
    renderUserButton();
    fireEvent.click(screen.getByTestId('nav-user-button'));

    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('nav-user-menu')).not.toBeInTheDocument();
  });

  it('routes to the profile', () => {
    renderUserButton();
    fireEvent.click(screen.getByTestId('nav-user-button'));
    fireEvent.click(screen.getByTestId('user-menu-profile'));

    expect(navigate).toHaveBeenCalledWith('/profile');
    expect(screen.queryByTestId('nav-user-menu')).not.toBeInTheDocument();
  });

  it('signs out and leaves for the auth page', async () => {
    renderUserButton();
    fireEvent.click(screen.getByTestId('nav-user-button'));
    fireEvent.click(screen.getByTestId('user-menu-logout'));

    expect(logout).toHaveBeenCalled();
    // Awaited inside the handler, so the navigate lands a tick later.
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth'));
  });

  it('keeps log out behind the menu rather than in the toolbar', () => {
    renderUserButton();

    // A permanent destructive button one stray click from signing you out is
    // what this replaced.
    expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('nav-user-button'));
    expect(screen.getByTestId('user-menu-logout')).toBeInTheDocument();
  });
});

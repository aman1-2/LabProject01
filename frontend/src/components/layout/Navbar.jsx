import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../atoms/Button.jsx';
import Icon from '../atoms/Icon.jsx';
import UserButton from '../atoms/UserButton.jsx';
import NavDrawer from './NavDrawer.jsx';
import CartDrawer from '../organisms/CartDrawer.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { toolsForRole } from '../../lib/roleNav.js';

/**
 * Class list for a top-level nav link, given whether it is the current page.
 *
 * Active is signalled twice over — the label darkens to full ink AND gains an
 * underline bar. Colour alone fails anyone who cannot distinguish the two
 * greys, which on a medical site is not a hypothetical audience.
 *
 * The bar is a pseudo-element rather than a border so it does not shift the
 * text by a pixel when it appears.
 */
function navLinkClass({ isActive }) {
  const base =
    'relative text-body font-semibold transition after:absolute after:-bottom-1.5 ' +
    'after:left-0 after:right-0 after:h-[2.5px] after:rounded-pill after:transition-all';
  return isActive
    ? `${base} text-ink after:bg-blue600 after:opacity-100`
    : `${base} text-muted hover:text-ink after:bg-transparent after:opacity-0`;
}

/**
 * Sticky Navbar conforming to DESIGN_SPEC §3.1 and prototype lines 50-68:
 * Logo left, centred nav links, Sign In / user right, hamburger below 768px.
 */
export function Navbar() {
  const { isAuthenticated, user } = useAuth();
  const roleTools = toolsForRole(user?.role);
  const navigate = useNavigate();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { count, isOpen: isCartOpen, openCart, closeCart } = useCart();

  return (
    <>
      <nav className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-[1240px] mx-auto px-7 py-4 flex items-center justify-between">
          {/* Brand Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 font-extrabold text-[21px] cursor-pointer select-none"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-blue600">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-blue600">Path</span>
            <span className="text-ink">Care</span>
          </Link>

          {/* Centred Nav Links (Desktop) */}
          <div className="hidden md:flex items-center gap-7">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/tests" className={navLinkClass} data-testid="nav-tests-link">
              Tests &amp; Packages
            </NavLink>
            <NavLink to="/doctors" className={navLinkClass} data-testid="nav-doctors-link">
              Find Doctors
            </NavLink>
            <NavLink to="/track" className={navLinkClass} data-testid="nav-track-link">
              Track Order
            </NavLink>
            <NavLink to="/partner" className={navLinkClass} data-testid="nav-partner-link">
              Partner
            </NavLink>

            {/* "For Doctors" used to sit here for everyone, pointing at the
                doctor dashboard. To a patient that is a link to a page they
                cannot use. Staff tools now appear only for the role that owns
                them, and are marked as staff tools so they do not read as
                another patient feature. */}
            {roleTools.map((tool) => (
              <NavLink
                key={tool.key}
                to={tool.to}
                data-testid={`nav-role-${tool.key}`}
                /* Already a blue pill when idle, so an underline would not
                   read. Active inverts it instead — the same signal strength
                   the plain links get from their bar. */
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-bodySmall font-bold transition ${
                    isActive
                      ? 'bg-blue600 text-white shadow-xs'
                      : 'bg-blue50 text-blue700 hover:bg-blue100'
                  }`
                }
              >
                <Icon name={tool.icon} size={14} strokeWidth={2.2} />
                {tool.label}
              </NavLink>
            ))}
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-3">
            {/* Cart. Always visible, signed in or not — a visitor building a
                basket before they have an account is the normal path, and
                hiding it behind sign-in is how baskets get abandoned. */}
            <button
              type="button"
              onClick={openCart}
              aria-label={count === 0 ? 'Your tests, empty' : `Your tests, ${count} in cart`}
              data-testid="nav-cart-btn"
              className="relative flex h-10 w-10 items-center justify-center rounded-[10px] border-[1.5px] border-border bg-white text-ink transition hover:border-blue600 hover:text-blue600"
            >
              <Icon name="cart" size={18} strokeWidth={1.9} />
              {count > 0 && (
                <span
                  data-testid="nav-cart-count"
                  className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue600 px-1 text-[11px] font-extrabold leading-none text-white"
                >
                  {count}
                </span>
              )}
            </button>

            {isAuthenticated ? (
              /* The name and a standing "Sign Out" used to sit here. The name
                 cost horizontal space the nav links need, and a permanent
                 destructive button one stray click from signing you out is not
                 something to leave in a toolbar. Both now live behind the
                 avatar. */
              <UserButton />
            ) : (
              <Button
                variant="primary"
                size="small"
                onClick={() => navigate('/auth')}
              >
                Sign In
              </Button>
            )}

            {/* Hamburger Button below 768px */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden w-10 h-10 rounded-[10px] border-[1.5px] border-border bg-white flex flex-col items-center justify-center gap-1 cursor-pointer flex-shrink-0"
            >
              <span className="w-[18px] h-[2px] bg-ink block" />
              <span className="w-[18px] h-[2px] bg-ink block" />
              <span className="w-[18px] h-[2px] bg-ink block" />
            </button>
          </div>
        </div>
      </nav>

      {/* Slide-out Drawer below 768px */}
      <NavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

      {/* Rendered from the navbar because the navbar is on every page — the
          cart must be reachable from wherever you happen to be browsing. */}
      {/* Mounted only while open. The drawer prices the basket with a query,
          and leaving it mounted on every page would subscribe every route to a
          fetch for a panel nobody is looking at. */}
      {isCartOpen && <CartDrawer open onClose={closeCart} />}
    </>
  );
}

export default Navbar;

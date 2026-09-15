import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../atoms/Button.jsx';
import Icon from '../atoms/Icon.jsx';
import { toolsForRole } from '../../lib/roleNav.js';

/**
 * Mobile Slide-out Drawer below 768px per DESIGN_SPEC §5 and prototype lines 185-191.
 */
/**
 * Class list for a drawer row.
 *
 * The desktop bar marks the current page with an underline; a full-width row
 * wants a left edge and a tinted background instead — the same signal in the
 * shape this layout allows. The transparent border on the inactive state keeps
 * the text from shifting 3px when a row becomes active.
 */
function drawerLinkClass({ isActive }) {
  const base =
    'py-3.5 pl-3 pr-1.5 font-bold text-body border-b border-border transition border-l-[3px]';
  return isActive
    ? `${base} text-blue700 border-l-blue600 bg-blue50`
    : `${base} text-ink border-l-transparent hover:text-blue600`;
}

export function NavDrawer({ isOpen, onClose }) {
  const { isAuthenticated, user, logout } = useAuth();
  const roleTools = toolsForRole(user?.role);
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-dark/45 z-40 md:hidden animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed top-0 right-0 w-[300px] max-w-[82vw] h-full bg-white z-50 shadow-float flex flex-col p-[22px] md:hidden animate-slide-in">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="self-end w-9 h-9 rounded-pill bg-chipGreyBg flex items-center justify-center text-muted hover:text-ink cursor-pointer mb-2.5 transition select-none"
        >
          ✕
        </button>

        <div className="flex flex-col gap-1 my-4">
          <NavLink
            to="/" end
            onClick={onClose}
            className={drawerLinkClass}
          >
            Home
          </NavLink>
          <NavLink
            to="/tests"
            onClick={onClose}
            className={drawerLinkClass}
            data-testid="drawer-tests-link"
          >
            Tests &amp; Packages
          </NavLink>
          <NavLink
            to="/doctors"
            onClick={onClose}
            className={drawerLinkClass}
            data-testid="drawer-doctors-link"
          >
            Find Doctors
          </NavLink>
          <NavLink
            to="/track"
            onClick={onClose}
            className={drawerLinkClass}
            data-testid="drawer-track-link"
          >
            Track Order
          </NavLink>
          {/* Staff tools, for the role that owns them. This matters more here
              than on desktop: below 768px the main nav is gone entirely, so
              without these a lab admin on a phone has no way in. */}
          {roleTools.map((tool) => (
            <NavLink
              key={tool.key}
              to={tool.to}
              onClick={onClose}
              data-testid={`drawer-role-${tool.key}`}
              className={({ isActive }) =>
                `flex items-center gap-2 border-b border-border border-l-[3px] py-3.5 pl-3 pr-1.5 text-body font-bold transition ${
                  isActive
                    ? 'border-l-blue600 bg-blue50 text-blue700'
                    : 'border-l-transparent text-blue700 hover:text-blue600'
                }`
              }
            >
              <Icon name={tool.icon} size={16} strokeWidth={2.2} />
              {tool.label}
            </NavLink>
          ))}

          <NavLink
            to="/partner"
            onClick={onClose}
            className={drawerLinkClass}
            data-testid="drawer-partner-link"
          >
            Partner with Us
          </NavLink>
        </div>

        <div className="mt-auto pt-4 border-t border-border">
          {isAuthenticated ? (
            <div className="space-y-3">
              <div className="text-xs text-muted">
                Signed in as <span className="font-bold text-ink">{user?.name}</span>
              </div>
              <Button
                variant="ghost"
                size="small"
                className="w-full"
                onClick={() => {
                  logout();
                  onClose();
                  navigate('/auth');
                }}
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="small"
              className="w-full"
              onClick={() => {
                onClose();
                navigate('/auth');
              }}
            >
              Sign In
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export default NavDrawer;

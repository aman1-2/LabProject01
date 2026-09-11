import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../atoms/Button.jsx';
import Icon from '../atoms/Icon.jsx';
import { toolsForRole } from '../../lib/roleNav.js';

/**
 * Mobile Slide-out Drawer below 768px per DESIGN_SPEC §5 and prototype lines 185-191.
 */
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
          <Link
            to="/"
            onClick={onClose}
            className="py-3.5 px-1.5 font-bold text-body text-ink border-b border-border hover:text-blue600 transition"
          >
            Home
          </Link>
          <Link
            to="/tests"
            onClick={onClose}
            className="py-3.5 px-1.5 font-bold text-body text-ink border-b border-border hover:text-blue600 transition"
            data-testid="drawer-tests-link"
          >
            Tests &amp; Packages
          </Link>
          <Link
            to="/doctors"
            onClick={onClose}
            className="py-3.5 px-1.5 font-bold text-body text-ink border-b border-border hover:text-blue600 transition"
            data-testid="drawer-doctors-link"
          >
            Find Doctors
          </Link>
          <Link
            to="/track"
            onClick={onClose}
            className="py-3.5 px-1.5 font-bold text-body text-ink border-b border-border hover:text-blue600 transition"
            data-testid="drawer-track-link"
          >
            Track Order
          </Link>
          {/* Staff tools, for the role that owns them. This matters more here
              than on desktop: below 768px the main nav is gone entirely, so
              without these a lab admin on a phone has no way in. */}
          {roleTools.map((tool) => (
            <Link
              key={tool.key}
              to={tool.to}
              onClick={onClose}
              data-testid={`drawer-role-${tool.key}`}
              className="flex items-center gap-2 border-b border-border px-1.5 py-3.5 text-body font-bold text-blue700 transition hover:text-blue600"
            >
              <Icon name={tool.icon} size={16} strokeWidth={2.2} />
              {tool.label}
            </Link>
          ))}

          <Link
            to="/partner"
            onClick={onClose}
            className="py-3.5 px-1.5 font-bold text-body text-ink border-b border-border hover:text-blue600 transition"
            data-testid="drawer-partner-link"
          >
            Partner with Us
          </Link>
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

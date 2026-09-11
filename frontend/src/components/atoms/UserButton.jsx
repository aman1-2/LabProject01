import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from './Icon.jsx';
import { toolsForRole, roleLabel } from '../../lib/roleNav.js';

/**
 * UserButton — the Slack project's `atoms/UserButton`, ported.
 *
 * Same shape: the avatar IS the trigger, and everything account-related lives
 * in the menu behind it. That replaces a navbar that spelled out the user's
 * name next to a permanent "Sign Out" button — which put a destructive action
 * one stray click away, and burned horizontal space that the nav links need.
 *
 * The menu is hand-rolled rather than Radix/shadcn `DropdownMenu`, for the
 * same reason the avatar is not Base UI: it would be the project's first
 * headless-UI dependency for one menu. What that costs us is behaviour we have
 * to implement deliberately, so it is all here and none of it is optional:
 * Escape closes, an outside click closes, focus returns to the trigger on
 * close, and the trigger reports `aria-expanded`/`aria-haspopup`.
 */
export default function UserButton() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Without this, focus is left on a node that has just been unmounted and
      // a keyboard user is dropped back at the top of the document.
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  async function logoutHandler() {
    setOpen(false);
    await logout();
    navigate('/auth');
  }

  const roleTools = toolsForRole(user.role);
  const label = roleLabel(user.role);

  const items = [
    { key: 'profile', icon: 'user', label: 'My profile', onSelect: () => go('/profile') },
    { key: 'bookings', icon: 'calendar', label: 'My bookings', onSelect: () => go('/profile') },
    { key: 'reports', icon: 'file', label: 'Reports', onSelect: () => go('/profile') },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        // The name is no longer on screen, so it has to be in the label —
        // otherwise this is an unlabelled circle to a screen reader.
        aria-label={`Account menu for ${user.name || user.accountHandle}`}
        data-testid="nav-user-button"
        className="rounded-full outline-none transition focus-visible:ring-4 focus-visible:ring-blue100"
      >
        <Avatar size="lg" className="transition hover:opacity-65">
          <AvatarImage src={user.avatarUrl} alt="" />
          <AvatarFallback name={user.name || user.accountHandle} />
        </Avatar>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="nav-user-menu"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[228px] overflow-hidden rounded-xl border border-border bg-white py-1.5 shadow-float"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-bodySmall font-extrabold text-ink">{user.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-caption text-muted">
              <span className="truncate">@{user.accountHandle}</span>
              {label && (
                <span
                  data-testid="user-menu-role"
                  className="shrink-0 rounded-pill bg-blue50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.04em] text-blue700"
                >
                  {label}
                </span>
              )}
            </p>
          </div>

          {/* Staff tools first: for someone with a console, that console is
              why they signed in. Separated from the account links below so it
              is clear these are a different kind of thing. */}
          {roleTools.length > 0 && (
            <div className="border-b border-border pb-1.5" data-testid="user-menu-role-tools">
              {roleTools.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  role="menuitem"
                  onClick={() => go(tool.to)}
                  data-testid={`user-menu-${tool.key}`}
                  className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition hover:bg-blue50"
                >
                  <Icon
                    name={tool.icon}
                    size={15}
                    strokeWidth={2.1}
                    className="mt-0.5 shrink-0 text-blue600"
                  />
                  <span>
                    <span className="block text-bodySmall font-bold text-ink">{tool.label}</span>
                    <span className="block text-caption leading-snug text-muted">
                      {tool.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={item.onSelect}
              data-testid={`user-menu-${item.key}`}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-bodySmall font-semibold text-ink transition hover:bg-blue50"
            >
              <Icon name={item.icon} size={15} strokeWidth={2.1} className="text-muted" />
              {item.label}
            </button>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={logoutHandler}
            data-testid="user-menu-logout"
            className="mt-1.5 flex w-full items-center gap-2.5 border-t border-border px-4 py-2.5 text-left text-bodySmall font-semibold text-red transition hover:bg-redBg"
          >
            <Icon name="logOut" size={15} strokeWidth={2.1} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

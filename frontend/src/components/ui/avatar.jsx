import React, { createContext, useContext, useMemo, useState } from 'react';
import { getAvatarColor, getInitials } from '@pathcare/design-tokens';
import { cn } from '../../lib/utils.js';

/**
 * Avatar — ported from the Slack project's `components/ui/avatar.jsx`.
 *
 * Same API and the same conventions, deliberately: `data-slot`, a `data-size`
 * of sm | default | lg driving size-6 / size-8 / size-10, the hairline ring
 * drawn with an `after:` pseudo-element, an initials fallback, plus
 * AvatarBadge and AvatarGroup.
 *
 * TWO DIFFERENCES FROM THE ORIGINAL, BOTH FORCED
 *
 * 1. No `@base-ui/react`. The primitive contributes one real behaviour — hide
 *    the <img> and show the fallback when the image is missing or fails to
 *    load — which is the `loaded` state below. That did not justify a UI-kit
 *    dependency, and re-implementing it keeps the failure mode identical.
 *
 * 2. PathCare's Tailwind config defines the product's own palette, not
 *    shadcn's semantic tokens. `bg-muted`, `text-muted-foreground`,
 *    `ring-background` and `bg-primary` are simply not classes in this project
 *    — pasted over unchanged they would render an unstyled grey circle. They
 *    map to blue50/blue700/white/blue600 here.
 *
 * The fallback colour is derived from the name so a given person is always the
 * same colour, everywhere they appear.
 */

const AvatarContext = createContext({ loaded: false, setLoaded: () => {} });

const SIZE_CLASSES = {
  sm: 'size-6',
  default: 'size-8',
  lg: 'size-10',
};

// Colour and initials come from the shared design tokens, so the website and
// the app cannot show the same patient as two different colours.
export { getAvatarColor, getInitials };

export function Avatar({ className, size = 'default', children, ...props }) {
  const [loaded, setLoaded] = useState(false);
  const value = useMemo(() => ({ loaded, setLoaded }), [loaded]);

  return (
    <AvatarContext.Provider value={value}>
      <span
        data-slot="avatar"
        data-size={size}
        className={cn(
          'group/avatar relative flex shrink-0 select-none rounded-full',
          'after:absolute after:inset-0 after:rounded-full after:border after:border-border',
          SIZE_CLASSES[size] ?? SIZE_CLASSES.default,
          className
        )}
        {...props}
      >
        {children}
      </span>
    </AvatarContext.Provider>
  );
}

export function AvatarImage({ className, src, onError, ...props }) {
  const { setLoaded } = useContext(AvatarContext);

  // No src is the ordinary case here — PathCare's User has no avatar field
  // yet. Rendering an <img> with src={undefined} makes the browser re-request
  // the current page, so it is simply not rendered.
  if (!src) return null;

  return (
    <img
      data-slot="avatar-image"
      src={src}
      className={cn('aspect-square size-full rounded-full object-cover', className)}
      onLoad={() => setLoaded(true)}
      onError={(event) => {
        // A broken image must fall back to initials, never to a broken-image
        // glyph where someone's face should be.
        setLoaded(false);
        onError?.(event);
      }}
      {...props}
    />
  );
}

export function AvatarFallback({ className, style, name, children, ...props }) {
  const { loaded } = useContext(AvatarContext);

  // Hidden once a real image is showing, so the initials never sit underneath.
  if (loaded) return null;

  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-full text-sm font-extrabold text-white',
        'group-data-[size=sm]/avatar:text-[10px] group-data-[size=lg]/avatar:text-base',
        className
      )}
      style={{ backgroundColor: getAvatarColor(name ?? ''), ...style }}
      {...props}
    >
      {children ?? getInitials(name ?? '')}
    </span>
  );
}

export function AvatarBadge({ className, ...props }) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'absolute bottom-0 right-0 z-10 inline-flex items-center justify-center rounded-full bg-blue600 text-white ring-2 ring-white select-none',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        className
      )}
      {...props}
    />
  );
}

export function AvatarGroup({ className, ...props }) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-white',
        className
      )}
      {...props}
    />
  );
}

export function AvatarGroupCount({ className, ...props }) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-blue50 text-sm font-bold text-blue700 ring-2 ring-white',
        'group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6',
        className
      )}
      {...props}
    />
  );
}

export default Avatar;

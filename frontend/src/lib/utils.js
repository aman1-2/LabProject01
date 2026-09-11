import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Same `cn` as the Slack project's `@/lib/utils`, and it is here for the same
 * reason: components take a base set of classes and let the caller override
 * them through `className`.
 *
 * Plain string concatenation does not achieve that. `class="size-8 size-10"`
 * does not mean "size-10 wins" — the browser applies whichever rule Tailwind
 * emitted later in the stylesheet, which is not the order they appear in the
 * attribute. tailwind-merge resolves the conflict by dropping the earlier
 * utility from the same group, so the caller's class actually wins.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default cn;

import { fetchCatalogue } from '@pathcare/api';
import { getBundledCatalogueResponse } from './bundledCatalogue.js';

/**
 * Bundled-first catalogue load.
 *
 * Emits the bundled catalogue synchronously-fast so the first frame has real
 * content (CONTEXT §7.3), then revalidates over the network and emits again.
 * A failed revalidation leaves the bundled data on screen — that is the whole
 * point of shipping it, and an offline first launch is precisely when a patient
 * most needs to see that the app works.
 *
 * `fetchLive` is injected so this is testable without a network or a device.
 */
export async function loadCatalogue({
  category = 'all',
  search = '',
  fetchLive = (params) => fetchCatalogue(params),
  onUpdate = null,
} = {}) {
  const bundledPayload = getBundledCatalogueResponse({ category, search });

  // 1. Immediate: real content, explicitly marked stale.
  if (onUpdate) onUpdate(bundledPayload);

  // 2. Revalidate.
  try {
    const live = await fetchLive({ category, search });
    const livePayload = {
      items: live?.items ?? [],
      isStale: false,
      pagination: live?.pagination,
    };
    if (onUpdate) onUpdate(livePayload);
    return livePayload;
  } catch (error) {
    return { ...bundledPayload, revalidationFailed: true, error };
  }
}

export default loadCatalogue;

import { useQuery } from '@tanstack/react-query';
import { fetchTests, fetchTestBySlug, fetchNearbyLabs } from './client.js';

/**
 * TanStack Query hooks for server state (CONTEXT §7.1).
 *
 * Pages read server data through these hooks and never through useEffect + fetch,
 * so caching, request de-duplication, retry and error handling are defined once
 * here rather than reimplemented per page.
 */

// Query keys are built in one place so a mutation can invalidate precisely.
export const catalogueKeys = {
  all: ['catalogue'],
  tests: (params) => ['catalogue', 'tests', params],
  test: (slug) => ['catalogue', 'test', slug],
  nearbyLabs: (params) => ['catalogue', 'nearbyLabs', params],
};

export function useTests({ category = 'all', search = '', limit = 100 } = {}) {
  return useQuery({
    queryKey: catalogueKeys.tests({ category, search, limit }),
    queryFn: () => fetchTests({ category, search, limit }),
  });
}

export function useTestBySlug(slug) {
  return useQuery({
    queryKey: catalogueKeys.test(slug),
    queryFn: () => fetchTestBySlug(slug),
    enabled: Boolean(slug),
  });
}

/**
 * Per-lab prices are computed server-side from the live catalogue (CONTEXT §3.2).
 * Disabled until a testId is known, so it never fires with an undefined test.
 */
export function useNearbyLabs({ lat, lng, testId, maxDistanceKm = 50 }) {
  return useQuery({
    queryKey: catalogueKeys.nearbyLabs({ lat, lng, testId, maxDistanceKm }),
    queryFn: () => fetchNearbyLabs({ lat, lng, testId, maxDistanceKm }),
    enabled: Boolean(testId) && lat != null && lng != null,
  });
}

export default { useTests, useTestBySlug, useNearbyLabs, catalogueKeys };

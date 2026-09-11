import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRiderJobs, acceptJob, updateRiderStatus, riderKeys } from '@pathcare/api';

/**
 * Server state for the rider app. All of it goes through TanStack Query
 * (CONTEXT §7.1) — no useEffect + fetch anywhere in this app.
 */

export function useRiderJobs({ enabled = true } = {}) {
  return useQuery({
    queryKey: riderKeys.jobs(),
    queryFn: () => fetchRiderJobs(),
    enabled,
    // A job posted while the rider is looking at the list should appear without
    // a pull-to-refresh; 30s is frequent enough to feel live without hammering
    // the API from every device at a centre.
    refetchInterval: 30000,
    // Never retry an auth failure: the shared client already refreshed once and
    // gave up, so retrying just delays the trip back to the login screen.
    retry: (failureCount, error) => error?.status !== 401 && error?.status !== 403 && failureCount < 2,
  });
}

/**
 * Claiming a job.
 *
 * The server claims atomically and answers 409 JOB_ALREADY_TAKEN when another
 * phlebotomist got there first. That is a normal outcome at a busy centre, not
 * a fault: the caller shows it as information and refetches, rather than as an
 * error dialog.
 */
export function useAcceptJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId) => acceptJob(bookingId),
    // Refetch on both paths: on success to pick up the new active job, on
    // conflict because the list we are showing is demonstrably stale.
    onSettled: () => queryClient.invalidateQueries({ queryKey: riderKeys.jobs() }),
  });
}

export function useRiderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status) => updateRiderStatus(status),
    onSettled: () => queryClient.invalidateQueries({ queryKey: riderKeys.jobs() }),
  });
}

export function useInvalidateJobs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: riderKeys.jobs() });
}

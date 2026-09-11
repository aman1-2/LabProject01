import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { collectSample, confirmCashReceived, submitSampleAtLab } from '@pathcare/api';
import { createOfflineQueue, RESULT } from './queue.js';

const OutboxContext = createContext(null);

/**
 * Maps a queued item to the API call that performs it.
 *
 * Every one of these goes through @pathcare/api. Nothing in this app builds a
 * request by hand.
 */
const SENDERS = {
  collect: (item) => collectSample(item.bookingId, item.payload),
  cash: (item) => confirmCashReceived(item.bookingId, item.payload),
  submitted: (item) => submitSampleAtLab(item.bookingId, item.payload),
};

async function sendQueuedItem(item) {
  const sender = SENDERS[item.kind];
  if (!sender) {
    // An unknown kind can only come from a downgrade or a corrupt record.
    // Throwing a non-retryable shape drops it rather than wedging the queue.
    throw { code: 'UNKNOWN_QUEUE_KIND', status: 400, isNetworkError: false };
  }
  return sender(item);
}

export function OutboxProvider({ children, onResult }) {
  const [pending, setPending] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const queue = useMemo(
    () =>
      createOfflineQueue({
        storage: AsyncStorage,
        send: sendQueuedItem,
        onChange: (items) => setPending(items.length),
      }),
    []
  );

  const drain = useCallback(async () => {
    const results = await queue.drain();
    for (const result of results) {
      if (result.outcome === RESULT.REJECTED && onResultRef.current) {
        onResultRef.current(result);
      }
    }
    setPending(await queue.size());
    return results;
  }, [queue]);

  const enqueue = useCallback(
    async (item) => {
      const queued = await queue.enqueue(item);
      // Try immediately: when there is signal this is just a normal request
      // that happens to be crash-safe.
      drain();
      return queued;
    },
    [queue, drain]
  );

  // Initial count, so a restart shows a pending badge before anything drains.
  useEffect(() => {
    queue.size().then(setPending);
  }, [queue]);

  // Reconnect and foreground are both drain triggers; the queue de-duplicates
  // overlapping drains itself.
  useEffect(() => {
    let cancelled = false;

    const subscription = Network.addNetworkStateListener?.((state) => {
      if (cancelled) return;
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) drain();
    });

    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') drain();
    });

    Network.getNetworkStateAsync()
      .then((state) => {
        if (cancelled) return;
        setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      subscription?.remove?.();
      appStateSubscription?.remove?.();
    };
  }, [drain]);

  const value = useMemo(
    () => ({ enqueue, drain, pending, isOnline, list: queue.list }),
    [enqueue, drain, pending, isOnline, queue.list]
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  const context = useContext(OutboxContext);
  if (!context) throw new Error('useOutbox must be used inside an OutboxProvider');
  return context;
}

import * as SQLite from 'expo-sqlite';
import { persistQueryClient } from '@tanstack/react-query-persist-client';

/**
 * Persists the TanStack Query cache to SQLite.
 *
 * CONTEXT §7.3: "Offline — TanStack Query cache persisted to SQLite." A patient
 * who opens the app on the Dehradun–Mussoorie road with no signal should still
 * see the catalogue they browsed and the booking they are tracking, rather than
 * a set of spinners.
 *
 * SQLite rather than AsyncStorage because this cache holds booking and report
 * data — dozens of KB of structured records — and AsyncStorage on Android is a
 * single-file key-value store that degrades badly at that size.
 *
 * Nothing here holds credentials: tokens live in expo-secure-store, and the
 * cache is purged on sign-out so a shared device does not leak the previous
 * patient's health data.
 */

const DATABASE_NAME = 'pathcare-cache.db';
const TABLE = 'query_cache';
const CACHE_KEY = 'pathcare-query-cache';

/**
 * Bumped when a cached shape changes. A mismatch discards the cache rather than
 * rehydrating records the code no longer understands.
 */
const CACHE_BUSTER = 'v1';

/** Persist for a week; anything older is refetched rather than shown. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let databasePromise = null;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`
      );
      return db;
    })();
  }
  return databasePromise;
}

/**
 * A persister over SQLite, matching the shape
 * @tanstack/react-query-persist-client expects.
 */
export const sqlitePersister = {
  persistClient: async (client) => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT OR REPLACE INTO ${TABLE} (key, value) VALUES (?, ?);`,
        CACHE_KEY,
        JSON.stringify(client)
      );
    } catch {
      // A cache write failing must never break the app. The data is still in
      // memory; only the next cold start loses it.
    }
  },

  restoreClient: async () => {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync(`SELECT value FROM ${TABLE} WHERE key = ?;`, CACHE_KEY);
      return row?.value ? JSON.parse(row.value) : undefined;
    } catch {
      // A corrupt or unreadable cache starts empty rather than crashing on launch.
      return undefined;
    }
  },

  removeClient: async () => {
    try {
      const db = await getDatabase();
      await db.runAsync(`DELETE FROM ${TABLE} WHERE key = ?;`, CACHE_KEY);
    } catch {
      /* nothing to do */
    }
  },
};

export function startQueryPersistence(queryClient) {
  const [unsubscribe, restored] = persistQueryClient({
    queryClient,
    persister: sqlitePersister,
    maxAge: MAX_AGE_MS,
    buster: CACHE_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        // Never persist an errored query: a cached failure would present as
        // real data on the next launch.
        if (query.state.status !== 'success') return false;

        // Payment orders are short-lived and must never be replayed from cache.
        const key = JSON.stringify(query.queryKey);
        return !key.includes('payment') && !key.includes('create-order');
      },
    },
  });

  return { unsubscribe, restored };
}

/** Called on sign-out — a shared phone must not retain the previous patient's data. */
export async function purgePersistedCache() {
  await sqlitePersister.removeClient();
}

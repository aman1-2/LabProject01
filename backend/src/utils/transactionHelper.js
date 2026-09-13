import mongoose from 'mongoose';
import logger from './logger.js';

let transactionSupport = null;

/**
 * Can this deployment run multi-document transactions?
 *
 * Answered with the documented `hello` command rather than by reaching into
 * `connection.client.topology.description.setName`, which is a private driver
 * internal: if it moves between driver versions the check silently returns
 * false against a real Atlas replica set and every caller quietly degrades to
 * non-atomic writes with no log line and no error (see MEDIUM M6).
 *
 * A replica set reports `setName`; a sharded cluster reports `msg: 'isdbgrid'`.
 */
export async function supportsTransactions() {
  if (transactionSupport !== null) {
    return transactionSupport;
  }

  try {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionSupport = Boolean(info?.setName) || info?.msg === 'isdbgrid';
  } catch (err) {
    logger.warn('Could not determine transaction support; assuming unavailable', {
      error: err.message,
    });
    transactionSupport = false;
  }

  return transactionSupport;
}

/** Clear the cached probe result (connection changes, tests). */
export function resetTransactionSupportCache() {
  transactionSupport = null;
}

/**
 * Run `operation(session)` inside a multi-document transaction.
 *
 * The session is passed to the operation and MUST be forwarded to every write
 * inside it — a session that is opened but not passed does nothing at all,
 * which looks like atomicity without providing any.
 *
 * Where transactions are unavailable (a standalone mongod, as several test
 * suites use) the operation runs with a null session and the degradation is
 * logged rather than being silent.
 *
 * Never wrap an external network call in here: a transaction held open across
 * an HTTP request to a payment gateway is a long-lived lock that will time out.
 * Record intent before the call and the outcome after it instead.
 */
export async function runInTransaction(operation, { label = 'transaction' } = {}) {
  if (!(await supportsTransactions())) {
    logger.warn('Transactions unavailable; running writes without atomicity', { label });
    return operation(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export default { supportsTransactions, resetTransactionSupportCache, runInTransaction };

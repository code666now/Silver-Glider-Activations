const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and point it at your database.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  // Close our own idle clients BEFORE the proxy in front of a managed Postgres
  // silently drops them. If the proxy wins the race we find out the ugly way —
  // an ECONNRESET on a connection we thought was good.
  idleTimeoutMillis: 10000,
  // A cold TLS handshake to a managed Postgres regularly needs more than 2s; a
  // too-tight budget turns a slow connect into a failed request under load.
  connectionTimeoutMillis: 10000,
  // TCP keepalives stop a proxy/NAT from considering an idle socket dead.
  // keepAlive alone is not enough: the delay defaults to the OS value (often two
  // HOURS), so probes never fire in time to matter. The explicit delay is what
  // actually does the work here.
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  // Recycle connections so a long-lived one can't outlive a failover.
  maxUses: 7500
});

// Without this, an idle client dropped by the network makes pg-pool emit 'error'
// on the Pool with no listener, and Node turns that into an uncaught exception
// that kills the process. This is the most important line in this file: a
// momentary DB blip must never take the service down mid-event.
pool.on('error', (err) => {
  console.error('[db] idle client error (pool will replace it):', err.message);
});

const RETRYABLE = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED',
  'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN',
  '57P01', // admin_shutdown — server closed the connection
  '57P03', // cannot_connect_now — server still starting
  '08006', // connection_failure
  '08003', // connection_does_not_exist
  '08001'  // sqlclient_unable_to_establish_sqlconnection
]);

const isRetryable = (err) =>
  RETRYABLE.has(err.code) || /Connection terminated|timeout exceeded/i.test(err.message || '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bound before we shadow pool.query below, so the wrapper doesn't recurse into itself.
const rawQuery = pool.query.bind(pool);

// Transient connection failures (a failover, a proxy dropping an idle socket)
// surface as a rejected query even though the same query on a fresh connection
// would succeed. Retry those with backoff. Real SQL errors — constraint
// violations, syntax errors — rethrow immediately; retrying them only wastes
// time and hides the bug.
//
// Shadowing pool.query means every existing call site in db/activationsDB.js
// gets this for free, with no changes there.
async function query(text, params) {
  const maxRetries = 2;
  for (let attempt = 0; ; attempt++) {
    try {
      return await rawQuery(text, params);
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) throw err;
      const backoffMs = 100 * 2 ** attempt;
      console.warn(`[db] ${err.code || err.message} — retry ${attempt + 1}/${maxRetries} in ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }
}

pool.query = query;

module.exports = pool;

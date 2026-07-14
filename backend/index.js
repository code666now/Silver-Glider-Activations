const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const pool = require('./config/db');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs the SQL migrations (CREATE TABLE IF NOT EXISTS ...) once at startup, in
// filename order. Idempotent — safe to re-run on every boot. The per-column
// ALTERs live in db/activationsDB.js and run when that module is required below.
async function runBaseMigrations() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
    console.log(`[migrations] applied ${file}`);
  }
}

// On a cold deploy the database can still be accepting-but-not-ready, or a
// restart can race us. Crashing on the first refusal makes the platform restart
// us into the same race; a short backoff rides it out instead.
async function runBaseMigrationsWithRetry(attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runBaseMigrations();
    } catch (err) {
      if (attempt >= attempts) throw err;
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 10000);
      console.warn(`[migrations] ${err.message} — retry ${attempt}/${attempts - 1} in ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }
}

function resolveSha() {
  try {
    return fs.readFileSync(path.join(__dirname, '../.git-sha'), 'utf8').trim();
  } catch {
    return process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';
  }
}

async function start() {
  await runBaseMigrationsWithRetry();

  const app = express();

  // Railway terminates TLS upstream, so req.ip / req.protocol only reflect the
  // real client once we trust the proxy's X-Forwarded-* headers.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '../frontend/public'), {
    maxAge: '1h',
    etag: true
  }));

  // Requiring the router also triggers db/activationsDB.js runMigrations() (idempotent ALTERs),
  // which is why it comes after the base CREATE TABLE migrations above.
  app.use('/activations', require('./routes/activations'));

  app.get('/activations-login', (req, res) =>
    res.sendFile(path.resolve(__dirname, '../frontend/views', 'activations-login.html')));

  app.get('/unsubscribe', async (req, res, next) => {
    const { email } = req.query;
    if (!email) return res.status(400).send('Missing email');
    try {
      await pool.query('UPDATE sg_activation_optins SET unsubscribed=TRUE WHERE email=$1', [email]);
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Unsubscribed</title></head><body style="background:#0a0a0a;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px"><div><p style="font-size:11px;letter-spacing:.15em;color:#444;text-transform:uppercase;margin-bottom:24px">⬡ Silver Glider</p><h1 style="font-size:24px;font-weight:700;margin-bottom:12px">You're unsubscribed.</h1><p style="color:#666;font-size:15px">You won't receive any more emails from us.</p></div></body></html>`);
    } catch (err) {
      next(err);
    }
  });

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({
        status: 'ok',
        sha: resolveSha(),
        db: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
        uptimeSec: Math.round(process.uptime())
      });
    } catch (err) {
      res.status(503).json({ status: 'error', error: err.message });
    }
  });

  app.use(require('./middleware/errorHandler'));

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => console.log(`Silver Glider Activations running on port ${PORT}`));

  // Attendees are on festival wifi; a stalled socket shouldn't pin a connection open.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;

  return server;
}

// Stop taking new requests, let in-flight ones finish, then close the pool.
// Without this, a redeploy cuts live voters off mid-request.
function installShutdownHandlers(server) {
  let shuttingDown = false;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[shutdown] ${signal} received, draining...`);
      const force = setTimeout(() => {
        console.error('[shutdown] drain timed out, forcing exit');
        process.exit(1);
      }, 10000);
      force.unref();
      server.close(async () => {
        await pool.end().catch(() => {});
        console.log('[shutdown] clean');
        process.exit(0);
      });
    });
  }
}

// Last line of defence. An unhandled rejection or a stray exception anywhere —
// a background email send, a timer, a bug in a render function — must not kill
// the process while attendees are voting. Log loudly, stay up; the platform's
// health check will pull us if we're genuinely broken.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err.stack || err);
});

start()
  .then(installShutdownHandlers)
  .catch((err) => {
    // Failing to boot is different from failing mid-flight: there's nothing to
    // serve, so exit and let the platform restart us.
    console.error('Failed to start Silver Glider Activations:', err);
    process.exit(1);
  });

const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const pool = require('./config/db');

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

function resolveSha() {
  try {
    return fs.readFileSync(path.join(__dirname, '../.git-sha'), 'utf8').trim();
  } catch {
    return process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';
  }
}

async function start() {
  await runBaseMigrations();

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../frontend/public')));

  // Requiring the router also triggers db/activationsDB.js runMigrations() (idempotent ALTERs),
  // which is why it comes after the base CREATE TABLE migrations above.
  app.use('/activations', require('./routes/activations'));

  app.get('/activations-login', (req, res) =>
    res.sendFile(path.resolve(__dirname, '../frontend/views', 'activations-login.html')));

  app.get('/unsubscribe', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).send('Missing email');
    try {
      await pool.query('UPDATE sg_activation_optins SET unsubscribed=TRUE WHERE email=$1', [email]);
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Unsubscribed</title></head><body style="background:#0a0a0a;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px"><div><p style="font-size:11px;letter-spacing:.15em;color:#444;text-transform:uppercase;margin-bottom:24px">⬡ Silver Glider</p><h1 style="font-size:24px;font-weight:700;margin-bottom:12px">You're unsubscribed.</h1><p style="color:#666;font-size:15px">You won't receive any more emails from us.</p></div></body></html>`);
    } catch (err) {
      res.status(500).send('Something went wrong. Please try again.');
    }
  });

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', sha: resolveSha() });
    } catch (err) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });

  app.use(require('./middleware/errorHandler'));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Silver Glider Activations running on port ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start Silver Glider Activations:', err);
  process.exit(1);
});

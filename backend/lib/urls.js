// Base URL for public-facing (frontend) pages: QR codes, email links, redirects.
// Priority: FRONTEND_URL (explicit frontend domain) → RAILWAY_BASE_URL → RAILWAY_PUBLIC_DOMAIN.
// Returns '' when nothing is configured, so callers still build valid relative paths.
function frontendUrl() {
  return process.env.FRONTEND_URL
    || process.env.RAILWAY_BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
}

module.exports = { frontendUrl };

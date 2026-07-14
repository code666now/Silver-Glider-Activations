// CORS for the activations backend.
//
// In the normal deploy this middleware does nothing: Netlify *proxies* /activations/*
// to this service (netlify.toml uses status=200, a rewrite), so the browser stays on
// the Netlify domain and every request is same-origin — no Origin header, no preflight.
// It exists for the cases that aren't: calling the Railway URL directly from another
// domain, a frontend served from localhost during development, or a future standalone
// frontend that stops going through the proxy.
//
// Allowlist rather than '*': the admin routes authenticate with a Bearer token that
// lives in localStorage, and a wildcard would let any page on the internet call them
// with a token it managed to lift. Origins come from CORS_ORIGINS (comma-separated),
// falling back to FRONTEND_URL so the deployed domain works without extra config.

const ORIGIN_ENV = ['CORS_ORIGINS', 'FRONTEND_URL', 'RAILWAY_BASE_URL', 'RAILWAY_PUBLIC_DOMAIN'];

// Browsers send Origin without a trailing slash and lowercase the scheme/host, so
// normalize both sides — otherwise "https://site.com/" in env silently never matches.
const normalize = (origin) => origin.trim().toLowerCase().replace(/\/+$/, '');

function parseOrigins(env = process.env) {
  const raw = ORIGIN_ENV.map((key) => env[key]).filter(Boolean).join(',');
  return new Set(raw.split(',').map(normalize).filter(Boolean));
}

function corsMiddleware(env = process.env) {
  const allowed = parseOrigins(env);

  return (req, res, next) => {
    // The response body is identical per origin but the headers are not, so caches
    // (Netlify's CDN, Railway's edge) must key on Origin or they'll hand one origin's
    // allow-header to another. Set this even when we don't allow the origin.
    res.vary('Origin');

    const origin = req.headers.origin;
    if (origin && allowed.has(normalize(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      // Authorization carries the admin Bearer token; Content-Type is what makes a
      // JSON POST preflight in the first place.
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    // A preflight is a browser question about headers, not a request for a resource —
    // answer it here rather than letting it fall through to a route that would 404 it.
    // A disallowed origin gets the same 204 with no allow-header, and the browser
    // blocks the real request itself.
    if (req.method === 'OPTIONS') return res.sendStatus(204);

    next();
  };
}

module.exports = corsMiddleware;
module.exports.parseOrigins = parseOrigins;

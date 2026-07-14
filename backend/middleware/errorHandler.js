// eslint-disable-next-line no-unused-vars -- Express only treats a 4-arg function as an error handler
function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.originalUrl}`, err.stack || err);

  // A handler that fails after streaming part of the response can't be given a
  // fresh status/body — writing again throws. Hand it to Express, which aborts
  // the socket.
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;

  // Don't leak internals (SQL text, file paths, connection strings) to attendees.
  // 4xx messages are ours and safe to show; 5xx are not.
  const message = status < 500
    ? (err.message || 'Bad request')
    : 'Something went wrong. Please try again.';

  // The public pages are HTML; answering a failed page load with a JSON blob
  // shows the visitor raw `{"error":...}` instead of a page.
  if (req.accepts(['html', 'json']) === 'html') {
    return res.status(status).send(
      `<!DOCTYPE html><html><head><meta charset="UTF-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1.0">` +
      `<title>Something went wrong</title></head>` +
      `<body style="background:#0a0a0a;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;` +
      `display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px">` +
      `<div><p style="font-size:11px;letter-spacing:.15em;color:#444;text-transform:uppercase;margin-bottom:24px">⬡ Silver Glider</p>` +
      `<h1 style="font-size:24px;font-weight:700;margin-bottom:12px">${message}</h1>` +
      `<p style="color:#666;font-size:15px">Refresh the page to try again.</p></div></body></html>`
    );
  }

  res.status(status).json({ error: message });
}

module.exports = errorHandler;

const jwt = require('jsonwebtoken');

// Activations admin auth — independent of the ticketing app's JWT (separate secret).
function requireActivationsAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Unauthorized' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.ACTIVATIONS_ADMIN_SECRET || 'activations-secret');
    if (payload.role !== 'activations_admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireActivationsAdmin };

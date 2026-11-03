const jwt = require('jsonwebtoken');
const { User } = require('../models');

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

async function attachUser(req) {
  const token = readToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(payload.sub);
    if (!user || user.isBlocked) return null;
    // A password change bumps tokenVersion, which retires every token issued
    // before it. Tokens minted before this field existed carry no version and
    // are treated as version 0, so nobody is logged out by the upgrade itself.
    // Tokens minted for a specific purpose (password reset, evidence links) are
    // never accepted as a session.
    if (payload.purpose) return null;

    const presented = payload.ver === undefined ? 0 : Number(payload.ver);
    const expected = Number(user.tokenVersion || 0);
    if (presented !== expected) return null;
    return user;
  } catch (err) {
    return null;
  }
}

/** Rejects the request when there is no valid, non-blocked user behind it. */
async function requireAuth(req, res, next) {
  const user = await attachUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  req.user = user;
  return next();
}

/** For endpoints that behave differently when signed in but do not require it. */
async function optionalAuth(req, res, next) {
  req.user = await attachUser(req);
  next();
}

/** Role check. Always used after requireAuth, never on its own. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.' });
  }
  return next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin, attachUser };

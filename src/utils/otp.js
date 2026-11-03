const crypto = require('crypto');

/**
 * Six-digit one-time codes.
 *
 * Only a keyed hash of the code is ever stored, so a database leak does not
 * hand someone a working reset code. The pepper comes from the environment so
 * that hashes are not portable between deployments.
 */
function pepper() {
  return process.env.OTP_PEPPER || process.env.JWT_SECRET || 'dev-otp-pepper';
}

function generateCode() {
  // crypto.randomInt is uniform, unlike Math.random or a modulo of randomBytes.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashCode(code) {
  return crypto.createHmac('sha256', pepper()).update(String(code).trim()).digest('hex');
}

function codesMatch(code, storedHash) {
  if (!storedHash) return false;
  const candidate = Buffer.from(hashCode(code), 'hex');
  const stored = Buffer.from(String(storedHash), 'hex');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

const TTL_MINUTES = () => parseInt(process.env.OTP_TTL_MINUTES, 10) || 10;
const MAX_ATTEMPTS = () => parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5;
const RESEND_SECONDS = () => parseInt(process.env.OTP_RESEND_SECONDS, 10) || 60;

function expiresAt() {
  return new Date(Date.now() + TTL_MINUTES() * 60 * 1000);
}

module.exports = {
  generateCode, hashCode, codesMatch, expiresAt,
  TTL_MINUTES, MAX_ATTEMPTS, RESEND_SECONDS,
};

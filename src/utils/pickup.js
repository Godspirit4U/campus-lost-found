const crypto = require('crypto');

// Ambiguous characters (0/O, 1/I) removed so a code can be read aloud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePickupCode(length = 6) {
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

module.exports = { generatePickupCode };

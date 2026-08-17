const crypto = require('crypto');

/**
 * Gera token seguro de 32 bytes (64 chars hex)
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash SHA-256 do token (para armazenar no banco)
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Comparação constante para evitar timing attacks
 */
function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = { generateToken, hashToken, safeCompare };

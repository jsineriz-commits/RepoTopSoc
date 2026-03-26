// api/_lib/auth.js
// Tokens HMAC simples (sin librerías externas).
// Formato: base64url(payload_json) + "." + base64url(hmac_sha256)
//
// Variable de entorno requerida: JWT_SECRET
// Si no está seteada, usa un fallback (INSEGURO para producción).

const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'dcac-fallback-secret-CHANGE-ME';

/**
 * Crea un token firmado con los datos del usuario.
 * @param {{ userId: string, name: string, email: string, isAdmin?: boolean }} payload
 * @param {number} [expiresInMs] - duración del token en ms (default: 12h)
 */
function createToken(payload, expiresInMs) {
  const data = {
    ...payload,
    exp: Date.now() + (expiresInMs || 12 * 60 * 60 * 1000),
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig     = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return encoded + '.' + sig;
}

/**
 * Verifica y decodifica un token.
 * Devuelve el payload o null si es inválido / expirado.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const expected = crypto.createHmac('sha256', SECRET).update(parts[0]).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

/**
 * Extrae el token del header Authorization: Bearer <token>
 */
function extractToken(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Middleware helper: verifica el token y devuelve el payload,
 * o envía 401 y retorna null.
 */
function requireAuth(req, res) {
  const token   = extractToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'No autorizado.' });
    return null;
  }
  return payload;
}

module.exports = { createToken, verifyToken, extractToken, requireAuth };

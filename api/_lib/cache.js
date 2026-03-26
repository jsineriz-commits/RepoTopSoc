// api/_lib/cache.js
// Cache en memoria — persiste entre invocaciones calientes de la misma instancia Vercel.
// En cold start se regenera automáticamente.
// Para producción con alta carga, reemplazar con Upstash Redis.

const _store = new Map();

const TTL = {
  DASHBOARD: 86400 * 1000,  // 24 horas (igual que CACHE_TTL en Apps Script)
  AUX:        7200 * 1000,  // 2 horas  (igual que AUX_TTL)
  GEOJSON:   21600 * 1000,  // 6 horas
};

function set(key, data, ttlMs) {
  _store.set(key, {
    data,
    expires: Date.now() + (ttlMs || TTL.DASHBOARD),
  });
}

function get(key) {
  const entry = _store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { _store.delete(key); return null; }
  return entry.data;
}

function del(key) {
  _store.delete(key);
}

/** Elimina todas las claves que comiencen con el prefijo dado. */
function delByPrefix(prefix) {
  for (const k of _store.keys()) {
    if (k.startsWith(prefix)) _store.delete(k);
  }
}

/** Limpia todo el store. */
function flush() {
  _store.clear();
}

module.exports = { set, get, del, delByPrefix, flush, TTL };

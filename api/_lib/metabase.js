// api/_lib/metabase.js
// Cliente para Metabase API.
// Variables de entorno requeridas:
//   METABASE_BASE_URL   — ej: https://metabase.miempresa.com
//   METABASE_USERNAME   — email del usuario Metabase
//   METABASE_PASSWORD   — contraseña
//   METABASE_QUESTION_ID — (opcional) ID de la question, default 64

const QUESTION_ID = process.env.METABASE_QUESTION_ID || '64';

/**
 * Autentica en Metabase y devuelve { id, baseUrl }.
 * Equivale a _fetchMetabaseToken() del .gs original.
 */
async function fetchMetabaseToken() {
  const rawUrl  = process.env.METABASE_BASE_URL;
  const mbUser  = process.env.METABASE_USERNAME;
  const mbPass  = process.env.METABASE_PASSWORD;

  if (!rawUrl || !mbUser || !mbPass) {
    throw new Error('Configuración Metabase incompleta. Verificar variables de entorno.');
  }

  const baseUrl = rawUrl.endsWith('/') ? rawUrl : rawUrl + '/';

  const res = await fetch(baseUrl + 'api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: mbUser, password: mbPass }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth Metabase falló (${res.status}): ${body.substring(0, 200)}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error('Metabase no devolvió token de sesión.');

  return { id: data.id, baseUrl };
}

/**
 * Ejecuta la query de Metabase con un token ya obtenido.
 * Equivale a _fetchMetabaseRowsWithToken() del .gs original.
 *
 * @param {string|number} userId
 * @param {{ id: string, baseUrl: string }} tokenData
 * @returns {Promise<{ rows: any[][], headers: string[] }>}
 */
async function fetchMetabaseRows(userId, tokenData) {
  const params = new URLSearchParams();
  params.append('parameters', '[]');

  const res = await fetch(tokenData.baseUrl + `api/card/${QUESTION_ID}/query/json`, {
    method:  'POST',
    headers: {
      'Content-Type':        'application/x-www-form-urlencoded',
      'X-Metabase-Session':  tokenData.id,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    throw new Error(`Metabase JSON Export error (${res.status})`);
  }

  let jsonArray;
  try {
    jsonArray = await res.json();
  } catch (e) {
    throw new Error(`Metabase devolvió respuesta inválida JSON Export (${res.status})`);
  }

  if (!Array.isArray(jsonArray)) {
    throw new Error(`Error en Metabase Export: No devolvió un array. Status: ${res.status}`);
  }

  if (jsonArray.length === 0) {
    return { rows: [], headers: [] };
  }

  const rawHeaders = Object.keys(jsonArray[0]);
  const headers = rawHeaders.map(h => h.trim().toLowerCase());
  const rows = jsonArray.map(obj => rawHeaders.map(h => obj[h]));

  return { rows, headers };
}

/**
 * Autenticar + consultar en una sola llamada.
 * Equivale a _fetchMetabaseRowsLive() del .gs original.
 */
async function fetchMetabaseRowsLive(userId) {
  const tokenData = await fetchMetabaseToken();
  return fetchMetabaseRows(userId, tokenData);
}

module.exports = { fetchMetabaseToken, fetchMetabaseRows, fetchMetabaseRowsLive };

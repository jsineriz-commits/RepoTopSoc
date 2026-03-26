// api/warmUp.js
// Endpoint llamado por el Vercel Cron Job todos los días a las 8 AM (Argentina).
// Equivale al trigger diario warmUpAllUsersCache() del .gs original.
//
// Vercel invoca los cron jobs con un header:
//   Authorization: Bearer <CRON_SECRET>
// donde CRON_SECRET es una variable de entorno que Vercel setea automáticamente.
// Si preferís protegerlo con tu propio secret, usar WARM_UP_SECRET.

const { warmUpAllUsersCache } = require('./_lib/logic');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Verificación de seguridad: solo Vercel Cron o llamadas con el secret correcto
  const authHeader  = req.headers['authorization'] || '';
  const cronSecret  = process.env.CRON_SECRET || '';
  const warmSecret  = process.env.WARM_UP_SECRET || '';

  const isVercelCron = authHeader === `Bearer ${cronSecret}` && cronSecret !== '';
  const isManual     = warmSecret !== '' && req.query.secret === warmSecret;

  if (cronSecret !== '' && !isVercelCron && !isManual) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  try {
    const result = await warmUpAllUsersCache();
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/warmUp]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};

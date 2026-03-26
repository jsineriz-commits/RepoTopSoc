// api/invalidateCache.js
const { invalidateAuxCache, invalidateUserCache, invalidateAllCache } = require('./_lib/logic');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { type, userId } = req.body || {};

  try {
    let result;
    if (type === 'aux') {
      result = invalidateAuxCache();
    } else if (type === 'user' && userId) {
      if (!user.isAdmin && userId !== user.userId) return res.status(403).json({ error: 'Sin permisos.' });
      result = invalidateUserCache(userId);
    } else if (type === 'all' && user.isAdmin) {
      result = invalidateAllCache();
    } else {
      // Por defecto, invalida solo la caché del usuario autenticado
      result = invalidateUserCache(user.userId);
    }
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/invalidateCache]', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

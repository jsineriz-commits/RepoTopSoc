// api/refreshUserFromMetabase.js
const { refreshUserFromMetabase } = require('./_lib/logic');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const requestedUserId = String((req.body && req.body.userId) || '').trim();
  const userId = (user.isAdmin || requestedUserId === '0')
    ? (requestedUserId || user.userId)
    : user.userId;

  try {
    const result = await refreshUserFromMetabase(userId);
    res.status(result.success ? 200 : 500).json(result);
  } catch (e) {
    console.error('[api/refreshUserFromMetabase]', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

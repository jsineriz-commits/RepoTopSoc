// api/getDashboardData.js
const { getDashboardData } = require('./_lib/logic');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return; // requireAuth ya envió 401

  const requestedUserId = (req.query.userId || '').trim();

  // Un usuario no-admin solo puede ver sus propios datos
  const userId = (user.isAdmin || requestedUserId === '0')
    ? (requestedUserId || user.userId)
    : user.userId;

  try {
    const data = await getDashboardData(userId);
    res.status(200).json(data);
  } catch (e) {
    console.error('[api/getDashboardData]', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

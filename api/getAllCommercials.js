// api/getAllCommercials.js
const { getAllCommercials } = require('./_lib/logic');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  if (!user.isAdmin) return res.status(403).json({ error: 'Solo administradores.' });

  try {
    const list = await getAllCommercials();
    res.status(200).json(list);
  } catch (e) {
    console.error('[api/getAllCommercials]', e);
    res.status(500).json({ error: e.message });
  }
};

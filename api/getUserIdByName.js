// api/getUserIdByName.js
const { getUserIdByName } = require('./_lib/logic');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  if (!user.isAdmin) return res.status(403).json({ error: 'Solo administradores.' });

  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Parámetro "name" requerido.' });

  try {
    const id = await getUserIdByName(name);
    res.status(200).json({ id });
  } catch (e) {
    console.error('[api/getUserIdByName]', e);
    res.status(500).json({ error: e.message });
  }
};

// api/login.js
const { login } = require('./_lib/logic');
const { createToken } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos.' });

  try {
    const result = await login(email, password);
    if (!result.success) return res.status(401).json(result);

    // Generar token de sesión
    const token = createToken({
      userId:  result.userId,
      name:    result.name,
      email:   result.email,
      isAdmin: result.isAdmin || false,
    });

    res.status(200).json({ ...result, token });
  } catch (e) {
    console.error('[api/login]', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

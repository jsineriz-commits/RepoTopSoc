import { getGoogleSheet } from './utils/googleSheets.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const doc = await getGoogleSheet(sheetId);
        const sheet = doc.sheetsByTitle['usuarios'];
        const rows = await sheet.getRows();

        const searchEmail = email.toLowerCase().trim();

        for (const row of rows) {
            // Perfil Usuario Normal
            const dbEmail = (row.get('Email') || '').toLowerCase().trim();
            const dbPass = (row.get('Password') || '').trim();

            if (dbEmail === searchEmail && dbPass === password) {
                return res.json({
                    success: true,
                    userId: row.get('ID'),
                    name: row.get('Nombre') || dbEmail.split('@')[0],
                    email: dbEmail
                });
            }

            // Perfil Administrador (usando los mismos campos o columnas específicas)
            const adminEmail = (row.get('AdminEmail') || '').toLowerCase().trim();
            const adminPass = (row.get('AdminPassword') || '').trim();

            if (adminEmail !== '' && adminEmail === searchEmail && adminPass === password) {
                return res.json({
                    success: true,
                    userId: "0",
                    name: row.get('Nombre') || 'Administrador',
                    email: adminEmail,
                    isAdmin: true
                });
            }
        }

        return res.status(401).json({ success: false, error: 'Credenciales incorrectas.' });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Error en login: ' + error.message });
    }
}

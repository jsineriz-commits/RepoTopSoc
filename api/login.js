import { getGoogleSheetData } from './utils/googleSheets.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password } = req.body;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const rows = await getGoogleSheetData(sheetId, 'usuarios!A1:G200');
        if (!rows || rows.length === 0) throw new Error('No hay datos en la hoja usuarios');

        const searchEmail = email.toLowerCase().trim();

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const dbEmail = String(row[0] || '').toLowerCase().trim();
            const dbPass = String(row[1] || '').trim();

            if (dbEmail === searchEmail && dbPass === password) {
                return res.json({
                    success: true,
                    userId: String(row[3] || "0"),
                    name: String(row[2] || dbEmail.split('@')[0]).trim(),
                    email: dbEmail
                });
            }

            const adminEmail = String(row[5] || '').toLowerCase().trim();
            const adminPass = String(row[6] || '').trim();

            if (adminEmail !== '' && adminEmail === searchEmail && adminPass === password) {
                return res.json({
                    success: true,
                    userId: "0",
                    name: String(row[2] || 'Administrador').trim(),
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

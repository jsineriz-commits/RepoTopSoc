import { getGoogleSheet } from './utils/googleSheets.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const doc = await getGoogleSheet(sheetId);
        const sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'usuarios');
        if (!sheet) {
            return res.status(500).json({ success: false, error: 'No se encontró la hoja "usuarios".' });
        }

        // Cargamos las primeras 100 filas para el login (ajustar si hay más usuarios)
        await sheet.loadCells('A1:G100');

        const searchEmail = email.toLowerCase().trim();

        for (let i = 1; i < 100; i++) { // Empezamos en 1 para saltar el encabezado
            // 1. Usuario Normal (Col A=0, B=1, C=2, D=3)
            const dbEmail = String(sheet.getCell(i, 0).value || '').toLowerCase().trim();
            const dbPass = String(sheet.getCell(i, 1).value || '').trim();

            if (dbEmail === searchEmail && dbPass === password) {
                const rawId = sheet.getCell(i, 3).value;
                const numId = parseInt(rawId, 10);

                return res.json({
                    success: true,
                    userId: isNaN(numId) ? "0" : String(numId),
                    name: String(sheet.getCell(i, 2).value || dbEmail.split('@')[0]).trim(),
                    email: dbEmail
                });
            }

            // 2. Administrador (Col F=5, G=6)
            const adminEmail = String(sheet.getCell(i, 5).value || '').toLowerCase().trim();
            const adminPass = String(sheet.getCell(i, 6).value || '').trim();

            if (adminEmail !== '' && adminEmail === searchEmail && adminPass === password) {
                return res.json({
                    success: true,
                    userId: "0",
                    name: String(sheet.getCell(i, 2).value || 'Administrador').trim(),
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

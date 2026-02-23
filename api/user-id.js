import { getGoogleSheet } from './utils/googleSheets.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name } = req.body;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const doc = await getGoogleSheet(sheetId);
        const sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'usuarios');
        if (!sheet) return res.status(500).json({ error: 'No se encontró la hoja "usuarios".' });

        await sheet.loadCells('A1:D500'); // Col C=Nombre, Col D=ID

        for (let i = 1; i < 500; i++) {
            const dbName = (sheet.getCell(i, 2).value || '').trim();
            if (dbName.toLowerCase() === name.toLowerCase()) {
                return res.json({ id: sheet.getCell(i, 3).value });
            }
        }

        return res.json({ id: null });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

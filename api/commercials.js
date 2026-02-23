import { getGoogleSheet } from './utils/googleSheets.js';

export default async function handler(req, res) {
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const doc = await getGoogleSheet(sheetId);
        const sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'usuarios');
        if (!sheet) return res.status(500).json({ error: 'No se encontró la hoja "usuarios".' });

        const rows = await sheet.getRows();

        const commercials = [];
        const seen = new Set();

        for (const row of rows) {
            const name = (row.get('Nombre') || '').trim();
            if (name !== '' && !seen.has(name)) {
                seen.add(name);
                commercials.push(name);
            }
        }

        return res.json(commercials.sort());
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

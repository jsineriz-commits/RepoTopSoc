import { getGoogleSheet } from './utils/googleSheets.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name } = req.body;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const doc = await getGoogleSheet(sheetId);
        const sheet = doc.sheetsByTitle['usuarios'];
        const rows = await sheet.getRows();

        for (const row of rows) {
            const dbName = (row.get('Nombre') || '').trim();
            if (dbName.toLowerCase() === name.toLowerCase()) {
                return res.json({ id: row.get('ID') });
            }
        }

        return res.json({ id: null });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

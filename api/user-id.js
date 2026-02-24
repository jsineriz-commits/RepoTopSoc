import { getGoogleSheetData } from './utils/googleSheets.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { name } = req.body;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const rows = await getGoogleSheetData(sheetId, 'usuarios!A1:D500');

        for (let i = 1; i < rows.length; i++) {
            const dbName = String(rows[i][2] || '').trim();
            if (dbName.toLowerCase() === name.toLowerCase()) {
                return res.json({ id: String(rows[i][3] || '') });
            }
        }

        return res.json({ id: null });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

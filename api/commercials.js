import { getGoogleSheetData } from './utils/googleSheets.js';

export default async function handler(req, res) {
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const rows = await getGoogleSheetData(sheetId, 'usuarios!A1:C500');

        const commercials = [];
        const seen = new Set();

        for (let i = 1; i < rows.length; i++) {
            const name = (rows[i][2] || '').trim();
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

import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
];

export async function getGoogleSheet(sheetId) {
    const accountJson = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    if (!accountJson) {
        throw new Error('Falta la variable GOOGLE_SERVICE_ACCOUNT_EMAIL en Vercel.');
    }

    const serviceAccount = JSON.parse(accountJson);
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');

    if (!privateKey) {
        throw new Error('Falta la variable GOOGLE_PRIVATE_KEY en Vercel.');
    }

    const jwt = new JWT({
        email: serviceAccount.client_email,
        key: privateKey,
        scopes: SCOPES,
    });

    const doc = new GoogleSpreadsheet(sheetId, jwt);
    await doc.loadInfo();
    return doc;
}

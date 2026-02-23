import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
];

export async function getGoogleSheet(sheetId) {
    const accountJson = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    if (!accountJson) {
        throw new Error('Falta la variable GOOGLE_SERVICE_ACCOUNT_EMAIL en Vercel.');
    }

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(accountJson);
    } catch (e) {
        throw new Error('El JSON de GOOGLE_SERVICE_ACCOUNT_EMAIL no es válido. Asegúrate de copiarlo completo incluyendo las llaves { }.');
    }

    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim()
        .replace(/\\n/g, '\n')
        .replace(/"/g, ''); // Elimina comillas accidentales

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

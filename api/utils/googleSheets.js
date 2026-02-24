import { JWT } from 'google-auth-library';
import axios from 'axios';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

export async function getGoogleSheetData(sheetId, range) {
    const accountJson = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    if (!accountJson) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_EMAIL');

    const serviceAccount = JSON.parse(accountJson);
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim().replace(/\\n/g, '\n').replace(/"/g, '');

    if (!privateKey) throw new Error('Falta GOOGLE_PRIVATE_KEY');

    const jwt = new JWT({
        email: serviceAccount.client_email,
        key: privateKey,
        scopes: SCOPES,
    });

    const token = await jwt.authorize();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;

    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token.access_token}` }
    });

    return response.data.values || [];
}

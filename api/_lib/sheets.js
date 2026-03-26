// api/_lib/sheets.js
// Autenticación y acceso a Google Sheets via Service Account.
// Variable de entorno requerida: GOOGLE_SERVICE_ACCOUNT_KEY (JSON completo de la SA)

const { google } = require('googleapis');

// ID del spreadsheet activo
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID || '';

let _authClient = null;

async function getAuthClient() {
  if (_authClient) return _authClient;

  let credentials;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  try {
    if (rawKey && rawKey.trim().startsWith('{')) {
      credentials = JSON.parse(rawKey);
    } else {
      const emailVar = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      if (emailVar) {
        let actualEmail = emailVar.trim();
        try {
          // Por si acaso fuera un JSON con client_email
          const parsed = JSON.parse(emailVar);
          if (parsed && parsed.client_email) actualEmail = parsed.client_email;
        } catch(e) {}
        
        const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n').replace(/"/g, '');
        credentials = {
          client_email: actualEmail,
          private_key: privateKey
        };
      } else {
        throw new Error("Faltan variables de entorno.");
      }
    }
  } catch (e) {
    throw new Error('Error configurando credenciales de Google. Por favor, asegúrate de que GOOGLE_SERVICE_ACCOUNT_KEY (o las variables antiguas) contengan el JSON válido del Service Account.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  _authClient = await auth.getClient();
  return _authClient;
}

/**
 * Convierte número de columna (1-based) a letra(s) de columna de Sheets.
 * Ej: 1 → A, 11 → K, 26 → Z, 27 → AA, 47 → AU
 */
function colToLetter(n) {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Lee datos de una hoja. Si se especifica numCols, limita las columnas leídas.
 * Equivalente a sheet.getRange(1, 1, lastRow, numCols).getValues()
 *
 * @param {string} sheetName - nombre de la hoja (puede tener espacios)
 * @param {number} [numCols] - cantidad de columnas a leer (undefined = todas)
 * @returns {Promise<any[][]>} - array 2D de valores
 */
async function getSheetData(sheetName, numCols) {
  const auth    = await getAuthClient();
  const sheets  = google.sheets({ version: 'v4', auth });
  const quoted  = sheetName.includes(' ') ? `'${sheetName}'` : sheetName;
  const endCol  = numCols ? colToLetter(numCols) : '';
  const range   = endCol ? `${quoted}!A:${endCol}` : quoted;

  const isLoginSheet = sheetName.toLowerCase().trim() === 'usuarios';
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: isLoginSheet ? 'FORMATTED_VALUE' : 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING', 
  });
  return res.data.values || [];
}

/**
 * Acceso seguro a una celda de fila (las filas del API pueden ser más cortas).
 */
function g(row, idx) {
  return (row && row.length > idx && row[idx] !== null && row[idx] !== undefined)
    ? row[idx]
    : '';
}

module.exports = { getSheetData, g, SPREADSHEET_ID, colToLetter };

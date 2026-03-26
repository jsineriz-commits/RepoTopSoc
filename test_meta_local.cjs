const { fetchMetabaseToken, fetchMetabaseRowsLive } = require('./RepoTopSoc/api/_lib/metabase');
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.SPREADSHEET_ID || '1rR98SksO4rM25Yg1PzE9l3G92TjC810h3F6T9IomJc';
require('dotenv').config({ path: './RepoTopSoc/.env' });

async function main() {
  try {
    const tokenData = await fetchMetabaseToken();
    console.log("Token obtained!");
    
    const params = new URLSearchParams();
    params.append('parameters', '[]');

    const res = await fetch(tokenData.baseUrl + `api/card/145/query/json`, {
      method:  'POST',
      headers: {
        'Content-Type':        'application/x-www-form-urlencoded',
        'X-Metabase-Session':  tokenData.id,
      },
      body: params.toString()
    });
    
    const jsonArray = await res.json();
    console.log("Total rows from export API:", jsonArray.length);
    if (jsonArray.length > 0) {
      const gino = jsonArray.find(r => r.razon_social && String(r.razon_social).toLowerCase().includes('gino'));
      console.log("Gino:", gino ? gino.razon_social : "Not found");
    }
  } catch(e) { console.error(e); }
}
main();

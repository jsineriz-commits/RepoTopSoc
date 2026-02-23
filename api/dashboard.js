import { getMetabaseToken, queryMetabase } from './utils/metabase.js';
import { getGoogleSheet } from './utils/googleSheets.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.body;
    const questionId = process.env.METABASE_QUESTION_ID || '4557';
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        // 1. Fetch data from Metabase
        const token = await getMetabaseToken();
        const mbData = await queryMetabase(token, questionId, userId);

        if (!mbData.data || !mbData.data.rows) {
            return res.json({ success: false, error: 'Sin datos en Metabase.' });
        }

        // 2. Fetch supplemental data from Google Sheets
        const doc = await getGoogleSheet(sheetId);

        // Supplemental data maps
        const baseClaveMap = await getBaseClaveData(doc);
        const creditMaps = await getCreditPerformanceData(doc);
        const sacMap = await getSACData(doc);
        const dcpMap = await getDCPData(doc);

        // 3. Merge and Transform
        const cols = mbData.data.cols.map(c => c.name);
        const cuitColName = cols.find(c => {
            const l = String(c).toLowerCase();
            return l === 'cuit' || l === 'st.cuit' || l.includes('cuit');
        }) || cols[1];

        const processedRows = mbData.data.rows.map(row => {
            const obj = {};
            cols.forEach((col, i) => { obj[col] = row[i]; });

            const cuitVal = String(obj[cuitColName] || '').replace(/[^0-9]/g, '');
            const extra = baseClaveMap[cuitVal] || { Kt: '-', Kv: '-', '% u': '-' };
            const creditGen = creditMaps.general[cuitVal] || { nosis: '-', fact: '-' };
            const creditJD = creditMaps.jd[cuitVal] || '-';

            obj['Kt'] = extra.Kt === '-' ? '' : extra.Kt;
            obj['Kv'] = extra.Kv === '-' ? '' : extra.Kv;
            obj['% u'] = extra['% u'] === '-' ? '' : extra['% u'];

            obj['CCC'] = (obj['conc_gral'] != null && obj['conc_gral'] !== '') ? Math.round(parseFloat(obj['conc_gral']) * 100) + '%' : '';
            obj['CCC ult 5'] = (obj['porc_conc_5_Tot'] != null && obj['porc_conc_5_Tot'] !== '') ? Math.round(parseFloat(obj['porc_conc_5_Tot']) * 100) + '%' : '';

            obj['Ultimo ingreso'] = getRelativeTime(obj['ult_ingreso']);
            obj['Fecha Creacion'] = formatDateShort(obj['fecha_creacion']);

            obj['nosis'] = creditGen.nosis === '-' ? '' : creditGen.nosis;
            const fVal = parseLocaleNum(creditGen.fact);
            obj['fact'] = (fVal !== 0) ? (fVal / 1000000).toFixed(1) + 'M' : '';

            const cjd = parseFloat(String(creditJD).replace(',', '.'));
            obj['credito jd'] = (!isNaN(cjd) && creditJD !== '') ? Math.round(cjd).toString() : (creditJD === '-' ? '' : creditJD);
            obj['SAC'] = sacMap[cuitVal] || '';

            const dcpInfo = dcpMap[cuitVal] || { dcp: '', dcp_ef: '', dcp_prop: '' };
            obj['DCP'] = dcpInfo.dcp;
            obj['DCP EF'] = dcpInfo.dcp_ef;
            obj['DCP Prop'] = dcpInfo.dcp_prop;

            obj['CI FAE'] = (parseInt(obj['sugerido_ci_faena']) === 1) ? '✅' : '';
            obj['CI INV'] = (parseInt(obj['sugerido_ci_invernada']) === 1) ? '✅' : '';

            obj['Q total OP'] = obj['q_op_total'] || 0;
            obj['q ope'] = obj['Q total OP'];

            obj['FUOp'] = getRelativeTime(obj['Ult_op']);
            obj['FUAct'] = getRelativeTime(obj['Ult_act']);

            // GRUPO FAENA
            obj['OFR (F)'] = obj['q_ofrec_fae'] || '';
            obj['VEN (F)'] = obj['q_ventas_fae'] || '';
            obj['CCC (F)'] = (obj['conc_gral_fae'] != null) ? Math.round(parseFloat(obj['conc_gral_fae']) * 100) + '%' : '';
            obj['CCC ult5 (F)'] = (obj['porc_conc_5_Fae'] != null) ? Math.round(parseFloat(obj['porc_conc_5_Fae']) * 100) + '%' : '';
            obj['FUV (F)'] = getRelativeTime(obj['FUV_fae']);
            obj['Q Cis comp (F)'] = obj['cis_com_fae'] || '';
            obj['COMP (F)'] = obj['q_compras_fae'] || '';

            // GRUPO INVERNADA
            obj['OFR (I)'] = obj['q_ofrec_inv'] || '';
            obj['VEN (I)'] = obj['q_ventas_inv'] || '';
            obj['CCC (I)'] = (obj['conc_gral_inv'] != null) ? Math.round(parseFloat(obj['conc_gral_inv']) * 100) + '%' : '';
            obj['CCC ult5 (I)'] = (obj['porc_conc_5_Inv'] != null) ? Math.round(parseFloat(obj['porc_conc_5_Inv']) * 100) + '%' : '';
            obj['FUV (I)'] = getRelativeTime(obj['FUV_inv']);
            obj['Q Cis comp (I)'] = obj['cis_com_inv'] || '';
            obj['COMP (I)'] = obj['q_compras_inv'] || '';

            obj['FUC'] = getRelativeTime(obj['FUC']);

            return obj;
        });

        processedRows.sort((a, b) => (parseFloat(b['Q total OP']) || 0) - (parseFloat(a['Q total OP']) || 0));

        const baseHeaders = [
            'razon_social', 'Kt', 'Kv', '% u', 'CCC', 'CCC ult 5', 'cuit',
            'nosis', 'fact', 'SAC', 'credito jd',
            'Fecha Creacion', 'Ultimo ingreso', 'q_usuarios', 'Prov_direc_fisc',
            'asociado_comercial', 'representante'
        ];

        const nHeaders = ['DCP', 'CI FAE', 'CI INV', 'Q total OP', 'FUOp', 'FUAct'];
        const fHeaders = ['OFR (F)', 'VEN (F)', 'CCC (F)', 'CCC ult5 (F)', 'FUV (F)', 'Q Cis comp (F)', 'COMP (F)'];
        const iHeaders = ['OFR (I)', 'VEN (I)', 'CCC (I)', 'CCC ult5 (I)', 'FUV (I)', 'Q Cis comp (I)', 'COMP (I)'];
        const finHeaders = ['FUC', 'DCP EF', 'DCP Prop'];

        const headers = [...baseHeaders, ...nHeaders, ...fHeaders, ...iHeaders, ...finHeaders];

        return res.json({ success: true, headers, data: processedRows, total: processedRows.length });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: 'Error: ' + error.message });
    }
}

// --- HELPERS ---

async function getBaseClaveData(doc) {
    const map = {};
    const sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'base clave');
    if (!sheet) return map;

    // Cargamos hasta la columna Z y todas las filas
    const rowCount = Math.min(sheet.rowCount, 5000);
    await sheet.loadCells(`A1:Z${rowCount}`);

    // Encontrar índices
    let colCuit = -1, colKt = -1, colKv = -1, colPctU = -1;
    for (let c = 0; c < 26; c++) {
        const val = String(sheet.getCell(0, c).value || '').toLowerCase();
        if (val === 'cuit') colCuit = c;
        if (val === 'kt') colKt = c;
        if (val === 'kv') colKv = c;
        if (val === '% u') colPctU = c;
    }

    if (colCuit === -1) return map;

    for (let r = 1; r < rowCount; r++) {
        const cuitVal = String(sheet.getCell(r, colCuit).value || '').replace(/[^0-9]/g, '');
        if (cuitVal) {
            map[cuitVal] = {
                Kt: sheet.getCell(r, colKt !== -1 ? colKt : 1).value || '-',
                Kv: sheet.getCell(r, colKv !== -1 ? colKv : 2).value || '-',
                '% u': sheet.getCell(r, colPctU !== -1 ? colPctU : 3).value || '-'
            };
        }
    }
    return map;
}

async function getCreditPerformanceData(doc) {
    const maps = { general: {}, jd: {} };
    const sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'credit performance');
    if (!sheet) return maps;

    const rowCount = Math.min(sheet.rowCount, 5000);
    // Necesitamos hasta la columna 47 (AU) aprox
    await sheet.loadCells(`A1:BA${rowCount}`);

    for (let r = 1; r < rowCount; r++) {
        const cuitVal = String(sheet.getCell(r, 2).value || '').replace(/[^0-9]/g, '');
        if (cuitVal) {
            maps.general[cuitVal] = {
                nosis: sheet.getCell(r, 37).value || '',
                fact: sheet.getCell(r, 33).value || ''
            };
        }
        const cuitJDVal = String(sheet.getCell(r, 45).value || '').replace(/[^0-9]/g, '');
        if (cuitJDVal) {
            maps.jd[cuitJDVal] = sheet.getCell(r, 46).value || '';
        }
    }
    return maps;
}

async function getSACData(doc) {
    const map = {};
    const sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'sac');
    if (!sheet) return map;

    const rowCount = Math.min(sheet.rowCount, 5000);
    await sheet.loadCells(`A1:Z${rowCount}`);

    for (let r = 1; r < rowCount; r++) {
        const cuit = String(sheet.getCell(r, 17).value || '').replace(/[^0-9]/g, '');
        const valRaw = sheet.getCell(r, 22).value;
        if (cuit) {
            const num = parseFloat(valRaw);
            if (!isNaN(num) && num >= 0 && num <= 50) {
                map[cuit] = '✅';
            }
        }
    }
    return map;
}

async function getDCPData(doc) {
    const map = {};
    const sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'dcp');
    if (!sheet) return map;

    const rowCount = Math.min(sheet.rowCount, 5000);
    await sheet.loadCells(`A1:K${rowCount}`);

    for (let r = 1; r < rowCount; r++) {
        const cuit = String(sheet.getCell(r, 2).value || '').replace(/[^0-9]/g, '');
        if (cuit) {
            const valD = sheet.getCell(r, 3).value;
            const valE = sheet.getCell(r, 4).value;
            const dcpVal = (valD != null && valD !== '') ? Math.round(parseFloat(valD) * 100) + '%' : '';
            const propVal = (valE != null && valE !== '') ? Math.round(parseFloat(valE) * 100) + '%' : '';
            map[cuit] = { dcp: dcpVal, dcp_ef: dcpVal, dcp_prop: propVal };
        }
    }
    return map;
}

function parseLocaleNum(val) {
    if (val == null || val === '-' || val === '') return 0;
    let s = String(val).replace(/\s/g, "");
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(',')) {
        s = s.replace(",", ".");
    }
    return parseFloat(s) || 0;
}

function getRelativeTime(dateStr) {
    if (!dateStr || dateStr === '-' || dateStr === '0000-01-01' || dateStr === 'null') return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 1) return 'hoy';
        if (diffDays < 30) return diffDays + 'd';
        const m = Math.floor(diffDays / 30);
        if (m < 12) return m + 'm';
        const y = Math.floor(diffDays / 365);
        return (y >= 5) ? '5a' : y + 'a';
    } catch (e) { return ''; }
}

function formatDateShort(dateStr) {
    if (!dateStr || dateStr === '-' || dateStr === '0000-01-01' || dateStr === 'null') return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        const d = date.getDate();
        const m = date.getMonth() + 1;
        const y = date.getFullYear().toString().substr(-2);
        return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y;
    } catch (e) { return ''; }
}

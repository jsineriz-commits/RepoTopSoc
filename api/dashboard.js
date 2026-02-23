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
            const raw = {};
            cols.forEach((col, i) => { raw[col] = row[i]; });

            // Versión normalizada para acceso fácil
            const obj = {};
            Object.keys(raw).forEach(k => { obj[k.toLowerCase()] = raw[k]; });

            const cuitVal = String(obj[cuitColName.toLowerCase()] || '').replace(/[^0-9]/g, '');
            const extra = baseClaveMap[cuitVal] || { Kt: '-', Kv: '-', '% u': '-' };
            const creditGen = creditMaps.general[cuitVal] || { nosis: '-', fact: '-' };
            const creditJD = creditMaps.jd[cuitVal] || '-';

            const rowData = { ...raw }; // Mantener nombres originales de Metabase

            rowData['Kt'] = extra.Kt === '-' ? '' : extra.Kt;
            rowData['Kv'] = extra.Kv === '-' ? '' : extra.Kv;
            rowData['% u'] = extra['% u'] === '-' ? '' : extra['% u'];

            // Usar keys normalizadas para buscar datos de Metabase
            const concGral = obj['conc_gral'];
            const conc5Tot = obj['porc_conc_5_tot'] || obj['porc_conc_5_total'] || obj['conc_5_tot'];

            rowData['CCC'] = (concGral != null && concGral !== '') ? Math.round(parseFloat(concGral) * 100) + '%' : '';
            rowData['CCC ult 5'] = (conc5Tot != null && conc5Tot !== '') ? Math.round(parseFloat(conc5Tot) * 100) + '%' : '';

            rowData['Ultimo ingreso'] = getRelativeTime(obj['ult_ingreso']);
            rowData['Fecha Creacion'] = formatDateShort(obj['fecha_creacion']);

            rowData['nosis'] = creditGen.nosis === '-' ? '' : creditGen.nosis;
            const fVal = parseLocaleNum(creditGen.fact);
            rowData['fact'] = (fVal !== 0) ? (fVal / 1000000).toFixed(1) + 'M' : '';

            const cjd = parseFloat(String(creditJD).replace(',', '.'));
            rowData['credito jd'] = (!isNaN(cjd) && creditJD !== '') ? Math.round(cjd).toString() : (creditJD === '-' ? '' : creditJD);
            rowData['SAC'] = sacMap[cuitVal] || '';

            const dcpInfo = dcpMap[cuitVal] || { dcp: '', dcp_ef: '', dcp_prop: '' };
            rowData['DCP'] = dcpInfo.dcp;
            rowData['DCP EF'] = dcpInfo.dcp_ef;
            rowData['DCP Prop'] = dcpInfo.dcp_prop;

            rowData['CI FAE'] = (parseInt(obj['sugerido_ci_faena']) === 1) ? '✅' : '';
            rowData['CI INV'] = (parseInt(obj['sugerido_ci_invernada']) === 1) ? '✅' : '';

            rowData['Q total OP'] = obj['q_op_total'] || 0;
            rowData['q ope'] = rowData['Q total OP'];

            rowData['FUOp'] = getRelativeTime(obj['ult_op']);
            rowData['FUAct'] = getRelativeTime(obj['ult_act']);

            // GRUPO FAENA
            rowData['OFR (F)'] = obj['q_ofrec_fae'] || '';
            rowData['VEN (F)'] = obj['q_ventas_fae'] || '';
            const concFae = obj['conc_gral_fae'];
            const conc5Fae = obj['porc_conc_5_fae'];
            rowData['CCC (F)'] = (concFae != null) ? Math.round(parseFloat(concFae) * 100) + '%' : '';
            rowData['CCC ult5 (F)'] = (conc5Fae != null) ? Math.round(parseFloat(conc5Fae) * 100) + '%' : '';
            rowData['FUV (F)'] = getRelativeTime(obj['fuv_fae']);
            rowData['Q Cis comp (F)'] = obj['cis_com_fae'] || '';
            rowData['COMP (F)'] = obj['q_compras_fae'] || '';

            // GRUPO INVERNADA
            rowData['OFR (I)'] = obj['q_ofrec_inv'] || '';
            rowData['VEN (I)'] = obj['q_ventas_inv'] || '';
            const concInv = obj['conc_gral_inv'];
            const conc5Inv = obj['porc_conc_5_inv'];
            rowData['CCC (I)'] = (concInv != null) ? Math.round(parseFloat(concInv) * 100) + '%' : '';
            rowData['CCC ult5 (I)'] = (conc5Inv != null) ? Math.round(parseFloat(conc5Inv) * 100) + '%' : '';
            rowData['FUV (I)'] = getRelativeTime(obj['fuv_inv']);
            rowData['Q Cis comp (I)'] = obj['cis_com_inv'] || '';
            rowData['COMP (I)'] = obj['q_compras_inv'] || '';

            rowData['FUC'] = getRelativeTime(obj['fuc']);

            return rowData;
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

    const rowCount = Math.min(sheet.rowCount, 5000);
    await sheet.loadCells(`A1:Z${rowCount}`);

    let colCuit = 1, colKt = 2, colKv = 3, colPctU = 8;

    // Buscar encabezados en las primeras 5 filas para ser más robustos
    let found = false;
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 26; c++) {
            const val = String(sheet.getCell(r, c).value || '').toLowerCase().trim();
            if (val === 'cuit' || val.includes('cuit')) { colCuit = c; found = true; }
            if (val === 'kt') colKt = c;
            if (val === 'kv') colKv = c;
            if (val.startsWith('%') || val.includes('utiliz') || val === '% u' || val === '%u') colPctU = c;
        }
        if (found) break; // Si encontramos el CUIT, asumimos que esta es la fila de encabezados
    }

    for (let r = 1; r < rowCount; r++) {
        const val = sheet.getCell(r, colCuit).value;
        const cuitVal = formatCuit(val);
        if (cuitVal && cuitVal.length > 5) {
            map[cuitVal] = {
                Kt: sheet.getCell(r, colKt).value || '-',
                Kv: sheet.getCell(r, colKv).value || '-',
                '% u': sheet.getCell(r, colPctU).value || '-'
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
    await sheet.loadCells(`A1:BA${rowCount}`);

    let cCuit = 2, fIdx = 33, nIdx = 37, cCuitJD = 45, jdIdx = 46;

    // Buscar encabezados
    let found = false;
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 50; c++) {
            const val = String(sheet.getCell(r, c).value || '').toLowerCase().trim();
            if (val === 'cuit' || (val.includes('cuit') && c < 5)) { cCuit = c; found = true; }
            if (val.includes('facturacion') || val === 'fact') fIdx = c;
            if (val.includes('nosis')) nIdx = c;
            if (val.includes('cuit') && c > 40) cCuitJD = c;
            if (val === 'credito jd' || val === 'jd') jdIdx = c;
        }
        if (found) break;
    }

    for (let r = 1; r < rowCount; r++) {
        const cVal = formatCuit(sheet.getCell(r, cCuit).value);
        if (cVal) {
            maps.general[cVal] = {
                nosis: sheet.getCell(r, nIdx).value || '',
                fact: sheet.getCell(r, fIdx).value || ''
            };
        }
        const cJDVal = formatCuit(sheet.getCell(r, cCuitJD).value);
        if (cJDVal) {
            maps.jd[cJDVal] = sheet.getCell(r, jdIdx).value || '';
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

function formatCuit(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'number') return val.toFixed(0);
    return String(val).replace(/[^0-9]/g, '');
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

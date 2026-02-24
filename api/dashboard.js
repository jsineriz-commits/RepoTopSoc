import { getMetabaseToken, queryMetabase } from './utils/metabase.js';
import { getGoogleSheetData } from './utils/googleSheets.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId } = req.body;
    const questionId = process.env.METABASE_QUESTION_ID || '4557';
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const token = await getMetabaseToken();
        const mbData = await queryMetabase(token, questionId, userId);

        if (!mbData.data || !mbData.data.rows) {
            return res.json({ success: false, error: 'Sin datos en Metabase.' });
        }

        // Fetch supplemental data from Google Sheets (RAW)
        const [baseRows, creditRows, sacRows, dcpRows] = await Promise.all([
            getGoogleSheetData(sheetId, 'base clave!A1:Z5000'),
            getGoogleSheetData(sheetId, 'credit performance!A1:BA5000'),
            getGoogleSheetData(sheetId, 'SAC!A1:Z5000'),
            getGoogleSheetData(sheetId, 'DCP!A1:K1000')
        ]);

        const baseClaveMap = parseBaseClave(baseRows);
        const creditMaps = parseCreditPerformance(creditRows);
        const sacMap = parseSAC(sacRows);
        const dcpMap = parseDCP(dcpRows);

        const cols = mbData.data.cols.map(c => c.name);
        const cuitColName = cols.find(c => {
            const l = String(c).toLowerCase();
            return l === 'cuit' || l === 'st.cuit' || l.includes('cuit');
        }) || cols[1];

        const processedRows = mbData.data.rows.map(row => {
            const raw = {};
            cols.forEach((col, i) => { raw[col] = row[i]; });

            const obj = {};
            Object.keys(raw).forEach(k => { obj[k.toLowerCase()] = raw[k]; });

            const cuitVal = String(obj[cuitColName.toLowerCase()] || '').replace(/[^0-9]/g, '');
            const extra = baseClaveMap[cuitVal] || { Kt: '-', Kv: '-', '% u': '-' };
            const creditGen = creditMaps.general[cuitVal] || { nosis: '-', fact: '-' };
            const creditJD = creditMaps.jd[cuitVal] || '-';

            const rowData = { ...raw };

            rowData['Kt'] = extra.Kt === '-' ? '' : extra.Kt;
            rowData['Kv'] = extra.Kv === '-' ? '' : extra.Kv;
            rowData['% u'] = extra['% u'] === '-' ? '' : extra['% u'];
            rowData['Prov_direc_fisc'] = extra.prov === '-' ? '' : extra.prov;

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

// --- PARSERS ---

function parseBaseClave(rows) {
    const map = {};
    if (!rows || rows.length < 1) return map;

    let c = 1, kt = 2, kv = 3, pu = 8, prov = 10; // K is 10
    const header = rows[0].map(h => String(h).toLowerCase().trim());
    if (header.indexOf('cuit') !== -1) c = header.indexOf('cuit');
    if (header.indexOf('kt') !== -1) kt = header.indexOf('kt');
    if (header.indexOf('kv') !== -1) kv = header.indexOf('kv');
    if (header.indexOf('% u') !== -1) pu = header.indexOf('% u');
    // Búsqueda flexible para Prov Direc Fisc
    const pIdx = header.findIndex(h => h.includes('prov') && h.includes('fisc'));
    if (pIdx !== -1) prov = pIdx;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cuit = formatCuit(row[c]);
        if (cuit) map[cuit] = {
            Kt: row[kt] || '-',
            Kv: row[kv] || '-',
            '% u': row[pu] || '-',
            prov: row[prov] || '-'
        };
    }
    return map;
}

function parseCreditPerformance(rows) {
    const maps = { general: {}, jd: {} };
    if (!rows || rows.length < 1) return maps;

    let c = 2, f = 33, n = 37, cjd = 45, jd = 46;
    // Opcional: buscar por nombre si hace falta, pero los indices fijos son más seguros en este sheet

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cuit = formatCuit(row[c]);
        if (cuit) maps.general[cuit] = { nosis: row[n] || '', fact: row[f] || '' };

        const cuitJD = formatCuit(row[cjd]);
        if (cuitJD) maps.jd[cuitJD] = row[jd] || '';
    }
    return maps;
}

function parseSAC(rows) {
    const map = {};
    if (!rows || rows.length < 1) return map;
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cuit = formatCuit(row[17]);
        const val = parseFloat(row[22]);
        if (cuit && !isNaN(val) && val >= 0 && val <= 50) map[cuit] = '✅';
    }
    return map;
}

function parseDCP(rows) {
    const map = {};
    if (!rows || rows.length < 1) return map;
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cuit = formatCuit(row[2]);
        if (cuit) {
            const d = row[3], e = row[4];
            const dcp = (d != null && d !== '') ? Math.round(parseFloat(d) * 100) + '%' : '';
            const prop = (e != null && e !== '') ? Math.round(parseFloat(e) * 100) + '%' : '';
            map[cuit] = { dcp, dcp_ef: dcp, dcp_prop: prop };
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
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(',')) s = s.replace(",", ".");
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
        return (m < 12) ? m + 'm' : Math.floor(diffDays / 365) + 'a';
    } catch (e) { return ''; }
}

function formatDateShort(dateStr) {
    if (!dateStr || dateStr === '-' || dateStr === '0000-01-01' || dateStr === 'null') return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        const d = date.getDate(), m = date.getMonth() + 1, y = date.getFullYear().toString().substr(-2);
        return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y;
    } catch (e) { return ''; }
}

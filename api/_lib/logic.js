// api/_lib/logic.js
// Lógica de negocio completa. Equivalente al Code.gs v7 en Node.js async/await.

const { getSheetData, g } = require('./sheets');
const cache = require('./cache');
const { fetchMetabaseToken, fetchMetabaseRows, fetchMetabaseRowsLive } = require('./metabase');

// ─── HEADERS ──────────────────────────────────────────────────────────────────
const HEADERS = [
  'razon_social', 'Kt', 'Kv', '% u', 'CCC', 'CCC ult 5', 'cuit', 'nosis', 'fact', 'SAC',
  'credito jd', 'Fecha Creacion', 'Ultimo ingreso', 'q_usuarios', 'asociado_comercial',
  'representante', 'Prov_direc_fisc',
  'CI FAE', 'CI INV', 'Q total OP', 'FUOp', 'FUAct', 'MAG',
  'OFR (F)', 'VEN (F)', 'CCC (F)', 'CCC ult5 (F)', 'FUV (F)', 'Q Cis comp (F)', 'COMP (F)',
  'OFR (I)', 'VEN (I)', 'CCC (I)', 'CCC ult5 (I)', 'FUV (I)', 'Q Cis comp (I)', 'COMP (I)',
  'FUC', 'DCP EF', 'DCP Prop',
];
const QTOTAL_IDX = 19; // índice de 'Q total OP' en HEADERS

// Objetos vacíos pre-definidos (evitan crear {} nuevo por cada fila sin match)
const _EMPTY_BC  = { Kt: '', Kv: '', pct_u: '', prov: '' };
const _EMPTY_CG  = { nosis: '', fact: '' };
const _EMPTY_DCP = { dcp: '', dcp_ef: '', dcp_prop: '' };

// ─── LOGIN ────────────────────────────────────────────────────────────────────
/**
 * Verifica credenciales contra la hoja "usuarios".
 * Equivale a login() del .gs original.
 * Devuelve { success, userId, name, email, isAdmin } o { success: false, error }
 */
async function login(email, password) {
  try {
    const data   = await getSheetData('usuarios');
    const sEmail = email.toLowerCase().trim();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // Según captura: 0(A)=Pass, 1(B)=Email, 2(C)=Nombre, 3(D)=userId
      const dbEmail = String(g(row, 1)).toLowerCase().trim();
      const dbPass  = String(g(row, 0)).trim();

      if (dbEmail && dbEmail === sEmail && dbPass === password) {
        const uid = String(g(row, 3)).replace(/[^0-9]/g, '');
        if (!uid) return { success: false, error: 'ID inválido en base de datos.' };
        return {
          success: true,
          userId:  uid,
          name:    String(g(row, 2) || dbEmail.split('@')[0]).trim(),
          email:   dbEmail,
        };
      }

      // Columnas admin alternativas: 5=email_admin, 6=pass_admin
      const aEmail = String(g(row, 5)).toLowerCase().trim();
      const aPass  = String(g(row, 6)).trim();
      if (aEmail && aEmail === sEmail && aPass === password) {
        return {
          success: true,
          userId:  '0',
          name:    'Administrador (Global)',
          email:   aEmail,
          isAdmin: true,
        };
      }
    }
    return { success: false, error: 'Credenciales incorrectas.' };
  } catch (e) {
    console.error('[logic] login error:', e);
    return { success: false, error: 'Error en login: ' + e.message };
  }
}

// ─── AUX DATA ─────────────────────────────────────────────────────────────────
/**
 * Construye (o devuelve del caché 2h) los 4 mapas de datos auxiliares.
 * 1 cache.get() en vez de 4 llamadas separadas.
 * Equivale a getAllAuxData() del .gs original.
 */
async function getAllAuxData() {
  const cached = cache.get('aux_all');
  if (cached) return cached;

  console.log('[logic] getAllAuxData: cache miss, leyendo Sheets...');

  const [bc, creditMaps, sac, dcp] = await Promise.all([
    buildBaseClaveMap(),
    buildCreditMaps(),
    buildSACMap(),
    buildDCPMap(),
  ]);

  const aux = { bc, cg: creditMaps.general, cj: creditMaps.jd, sac, dcp };
  cache.set('aux_all', aux, cache.TTL.AUX);
  console.log('[logic] getAllAuxData: completado y cacheado.');
  return aux;
}

async function buildBaseClaveMap() {
  const map = {};
  // Intentar los distintos nombres posibles de la hoja
  const names = ['base clave', 'Base clave', 'Base Clave', 'BASE CLAVE'];
  let data = [];
  for (const name of names) {
    data = await getSheetData(name, 11); // columnas A:K
    if (data.length > 1) break;
  }
  if (!data.length) return map;

  const headers = data[0];
  const hMap    = {};
  for (let h = 0; h < headers.length; h++) hMap[String(headers[h]).toLowerCase().trim()] = h;

  const cuitIdx = hMap['cuit'] !== undefined ? hMap['cuit'] : 1;
  const ktIdx   = hMap['kt']   !== undefined ? hMap['kt']   : 2;
  const kvIdx   = hMap['kv']   !== undefined ? hMap['kv']   : 3;
  const puIdx   = hMap['% u']  !== undefined ? hMap['% u']  : 8;
  const provIdx = 10;

  for (let i = 1; i < data.length; i++) {
    const row  = data[i];
    const cuit = String(g(row, cuitIdx)).replace(/[^0-9]/g, '');
    if (cuit) {
      map[cuit] = {
        Kt:    g(row, ktIdx)   || '',
        Kv:    g(row, kvIdx)   || '',
        pct_u: g(row, puIdx)   || '',
        prov:  g(row, provIdx) || '',
      };
    }
  }
  return map;
}

async function buildCreditMaps() {
  const maps = { general: {}, jd: {} };
  // Intentar nombres posibles de la hoja
  const names = ['credit performance', 'Credit Performance', 'CreditPerformance', 'creditperformance'];
  let data = [];
  for (const name of names) {
    data = await getSheetData(name, 47); // columnas A:AU
    if (data.length > 1) break;
  }
  if (!data.length) return maps;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const cG  = String(g(row, 2)).replace(/[^0-9]/g, '');
    if (cG) maps.general[cG] = { nosis: g(row, 37) || '', fact: g(row, 33) || '' };
    const cJ = String(g(row, 45)).replace(/[^0-9]/g, '');
    if (cJ) maps.jd[cJ] = g(row, 46) || '';
  }
  return maps;
}

async function buildSACMap() {
  const map  = {};
  const data = await getSheetData('SAC', 23); // columnas A:W
  for (let i = 1; i < data.length; i++) {
    const row  = data[i];
    const cuit = String(g(row, 17)).replace(/[^0-9]/g, '');
    if (cuit) {
      const num = parseFloat(g(row, 22));
      map[cuit] = (!isNaN(num) && typeof g(row, 22) === 'number' && num >= 0 && num <= 50)
        ? '✅'
        : '';
    }
  }
  return map;
}

async function buildDCPMap() {
  const map  = {};
  const data = await getSheetData('DCP', 5); // columnas A:E
  for (let i = 1; i < data.length; i++) {
    const row  = data[i];
    const cuit = String(g(row, 2)).replace(/[^0-9]/g, '');
    if (cuit) {
      const dcpVal  = (g(row, 3) !== null && g(row, 3) !== '') ? parseFloat(g(row, 3)) : '';
      const propVal = (g(row, 4) !== null && g(row, 4) !== '') ? parseFloat(g(row, 4)) : '';
      map[cuit] = { dcp: dcpVal, dcp_ef: dcpVal, dcp_prop: propVal };
    }
  }
  return map;
}

// ─── MAPA DE COLUMNAS METABASE ────────────────────────────────────────────────
/**
 * Construye el mapa de índices de columna desde los headers de Metabase.
 * Equivale a _buildColumnMap() del .gs original.
 */
function buildColumnMap(hMap) {
  const allKeys = Object.keys(hMap);

  const find = (keys) => {
    for (const k of keys) {
      if (hMap[k.toLowerCase()] !== undefined) return hMap[k.toLowerCase()];
    }
    // Búsqueda borrosa
    for (const k of keys) {
      for (const header of allKeys) {
        if (header.includes(k.toLowerCase())) return hMap[header];
      }
    }
    return undefined;
  };

  return {
    razon_social:          find(['razon_social', 'nombre', 'cliente', 'empresa', 'asociado']),
    cuit:                  find(['cuit', 'tax_id', 'numero_cuit', 'cuit_empresa']),
    conc_gral:             find(['conc_gral', 'concentracion_general', 'ccc']),
    porc_conc_5_tot:       find(['porc_conc_5_tot', 'porc_concentracion_5', 'ccc_ult_5']),
    q_usuarios:            find(['q_usuarios', 'cantidad_usuarios', 'usuarios']),
    asociado_comercial:    find(['asociado_comercial', 'nombre_ejecutivo', 'vendedor', 'comercial']),
    id_comercial:          find(['id_comercial']),
    representante:         find(['representante', 'contacto']),
    sugerido_ci_faena:     find(['sugerido_ci_faena', 'ci_faena']),
    sugerido_ci_invernada: find(['sugerido_ci_invernada', 'ci_inv']),
    q_ventas_mag:          find(['q_ventas_mag', 'mag']),
    q_ventas_fae:          find(['q_ventas_fae', 'q_ven_fae', 'ventas_faena']),
    q_ventas_inv:          find(['q_ventas_inv', 'q_ven_inv', 'ventas_inv']),
    q_compras_fae:         find(['q_compras_fae', 'q_com_fae', 'compras_faena']),
    q_compras_inv:         find(['q_compras_inv', 'q_com_inv', 'compras_inv']),
    ult_op:                find(['ult_op', 'ultima_operacion', 'uop']),
    ult_act:               find(['ult_act', 'ultima_actualizacion', 'uact']),
    q_ofrec_fae:           find(['q_ofrec_fae', 'ofr_fae']),
    conc_gral_fae:         find(['conc_gral_fae', 'ccc_fae']),
    porc_conc_5_fae:       find(['porc_conc_5_fae', 'ccc_ult_5_fae']),
    fuv_fae:               find(['fuv_fae']),
    cis_com_fae:           find(['cis_com_fae', 'cisternas_fae']),
    q_ofrec_inv:           find(['q_ofrec_inv', 'ofr_inv']),
    conc_gral_inv:         find(['conc_gral_inv', 'ccc_inv']),
    porc_conc_5_inv:       find(['porc_conc_5_inv', 'ccc_ult_5_inv']),
    fuv_inv:               find(['fuv_inv']),
    cis_com_inv:           find(['cis_com_inv', 'cisternas_inv']),
    fecha_creacion:        find(['fecha_creacion', 'created_at', 'f_crea']),
    ult_ingreso:           find(['ult_ingreso', 'last_login', 'u_ing']),
    fuc:                   find(['fuc', 'ultima_compra', 'ucom']),
  };
}

// ─── buildRowArray ─────────────────────────────────────────────────────────────
/**
 * Construye el array final de una fila directamente (sin objeto intermedio).
 * Equivale a buildRowArray() del .gs original.
 */
function buildRowArray(row, C, bcMap, creditGen, creditJD, sacMap, dcpMap, nowTs) {
  const cuitRaw = C.cuit !== undefined ? row[C.cuit] : null;
  const cuit    = cuitRaw ? String(cuitRaw).replace(/[^0-9]/g, '') : '';

  const bc  = (cuit && bcMap[cuit])            || _EMPTY_BC;
  const cg  = (cuit && creditGen[cuit])        || _EMPTY_CG;
  const cj  = (cuit && creditJD[cuit] !== undefined) ? creditJD[cuit] : '';
  const dcp = (cuit && dcpMap[cuit])           || _EMPTY_DCP;
  const sac = (cuit && sacMap[cuit])           || '';

  // fact formateado
  const fVal    = _parseNum(cg.fact);
  const factStr = (fVal !== 0) ? (fVal / 1000000).toFixed(1) + 'M' : '';

  // crédito JD
  const cjNum = parseFloat(String(cj).replace(',', '.'));
  const cjStr = (!isNaN(cjNum) && cj !== '') ? Math.round(cjNum).toString() : '';

  // Q total operaciones
  const qTotal = (parseFloat(row[C.q_ventas_fae]  || 0)
               + parseFloat(row[C.q_ventas_inv]   || 0)
               + parseFloat(row[C.q_compras_fae]  || 0)
               + parseFloat(row[C.q_compras_inv]  || 0)
               + parseFloat(row[C.q_ventas_mag]   || 0));

  const v = (idx) => (idx !== undefined && row[idx] !== undefined) ? row[idx] : '';

  return [
    /* 0  razon_social       */ v(C.razon_social)              || '',
    /* 1  Kt                 */ _fmtK(bc.Kt),
    /* 2  Kv                 */ _fmtK(bc.Kv),
    /* 3  % u                */ bc.pct_u                       || '',
    /* 4  CCC                */ _fmtPct(v(C.conc_gral)),
    /* 5  CCC ult 5          */ _fmtPct(v(C.porc_conc_5_tot)),
    /* 6  cuit               */ cuitRaw                        || '',
    /* 7  nosis              */ cg.nosis                       || '',
    /* 8  fact               */ factStr,
    /* 9  SAC                */ sac,
    /* 10 credito jd         */ cjStr,
    /* 11 Fecha Creacion     */ _formatDate(v(C.fecha_creacion)),
    /* 12 Ultimo ingreso     */ _relTime(v(C.ult_ingreso), nowTs),
    /* 13 q_usuarios         */ v(C.q_usuarios)                || '',
    /* 14 asociado_comercial */ v(C.asociado_comercial)        || '',
    /* 15 representante      */ v(C.representante)             || '',
    /* 16 Prov_direc_fisc    */ bc.prov                        || '',
    /* 17 CI FAE             */ (parseInt(v(C.sugerido_ci_faena))     === 1) ? '✅' : '',
    /* 18 CI INV             */ (parseInt(v(C.sugerido_ci_invernada)) === 1) ? '✅' : '',
    /* 19 Q total OP         */ qTotal,
    /* 20 FUOp               */ _relTime(v(C.ult_op),       nowTs),
    /* 21 FUAct              */ _relTime(v(C.ult_act),      nowTs),
    /* 22 MAG                */ v(C.q_ventas_mag)   || '',
    /* 23 OFR (F)            */ v(C.q_ofrec_fae)    || '',
    /* 24 VEN (F)            */ v(C.q_ventas_fae)   || '',
    /* 25 CCC (F)            */ _fmtPct(v(C.conc_gral_fae)),
    /* 26 CCC ult5 (F)       */ _fmtPct(v(C.porc_conc_5_fae)),
    /* 27 FUV (F)            */ _relTime(v(C.fuv_fae),    nowTs),
    /* 28 Q Cis comp (F)     */ v(C.cis_com_fae)    || '',
    /* 29 COMP (F)           */ v(C.q_compras_fae)  || '',
    /* 30 OFR (I)            */ v(C.q_ofrec_inv)    || '',
    /* 31 VEN (I)            */ v(C.q_ventas_inv)   || '',
    /* 32 CCC (I)            */ _fmtPct(v(C.conc_gral_inv)),
    /* 33 CCC ult5 (I)       */ _fmtPct(v(C.porc_conc_5_inv)),
    /* 34 FUV (I)            */ _relTime(v(C.fuv_inv),    nowTs),
    /* 35 Q Cis comp (I)     */ v(C.cis_com_inv)    || '',
    /* 36 COMP (I)           */ v(C.q_compras_inv)  || '',
    /* 37 FUC                */ _relTime(v(C.fuc),         nowTs),
    /* 38 DCP EF             */ dcp.dcp_ef,
    /* 39 DCP Prop           */ dcp.dcp_prop,
  ];
}

// ─── CORE: buildDashboard ─────────────────────────────────────────────────────
/**
 * Construye el dashboard para un usuario a partir de datos Metabase + aux.
 * Si hay caché de 24h, lo devuelve directamente.
 * Equivale a getDashboardData() del .gs original.
 */
async function getDashboardData(userId) {
  const cached = cache.get('dash_' + userId);
  if (cached) {
    return {
      ...cached,
      fromCache: true,
      importTime: (cached.importTime || '').replace(' (LIVE)', '').replace('(LIVE)', '').trim(),
    };
  }

  console.log('[logic] getDashboardData: cache miss userId=' + userId);
  const result = await _buildDashboard(userId);
  if (result.success) cache.set('dash_' + userId, result, cache.TTL.DASHBOARD);
  return result;
}

async function _buildDashboard(userId, tokenData) {
  try {
    const mbData = tokenData
      ? await fetchMetabaseRows(userId, tokenData)
      : await fetchMetabaseRowsLive(userId);

    return _assembleDashboard(mbData, userId);
  } catch (e) {
    console.error('[logic] _buildDashboard error userId=' + userId + ':', e.message);
    return { success: false, error: e.message };
  }
}

async function _assembleDashboard(mbData, userId) {
  // Limpiar userId de cualquier coma que venga del frontend o de Google Sheets FORMATTED_VALUE
  const safeUserId = String(userId).replace(/[^0-9]/g, '');

  const hMap = Object.create(null);
  for (let h = 0; h < mbData.headers.length; h++) hMap[mbData.headers[h]] = h;
  const C   = buildColumnMap(hMap);
  const aux = await getAllAuxData();
  const nowTs = Date.now();

  // 1. Obtener nombre del usuario si necesita filtro local (no admin)
  let userName = '';
  if (safeUserId !== '0' && safeUserId !== '') {
    try {
      const usersData = await getSheetData('usuarios');
      for (let i = 1; i < usersData.length; i++) {
        const rId = String(g(usersData[i], 3)).replace(/[^0-9]/g, '');
        if (rId === safeUserId) {
          userName = String(g(usersData[i], 2)).trim();
          break;
        }
      }
    } catch(e) { console.error("Error buscando nombre de usuario para filtrado", e); }
  }

  // 2. Filtrar localmente si no es administrador (userId != 0)
  let validRows = mbData.rows;
  
  if (safeUserId !== '0' && safeUserId !== '') {
    validRows = mbData.rows.filter(r => {
      // Remover comas/puntos de miles que envía Metabase
      const rowIdComer = String(r[C.id_comercial] || '').replace(/[^0-9]/g, '');
      const rowRep = String(r[C.representante] || '').toLowerCase();
      const rowAc  = String(r[C.asociado_comercial] || '').toLowerCase();
      
      // Match por ID comercial (Asociados Comerciales directos)
      if (rowIdComer !== '' && rowIdComer === safeUserId) return true;
      
      // Match por nombre en asociado_comercial o representante
      if (userName) {
        if (rowRep.includes(userName.toLowerCase())) return true;
        if (rowAc.includes(userName.toLowerCase())) return true;
        
        // Convertir formato "Apellido, Nombre" a "Nombre Apellido"
        if (userName.includes(',')) {
          const parts = userName.split(',');
          if (parts.length === 2) {
             const fname = (parts[1].trim() + ' ' + parts[0].trim()).toLowerCase();
             if (rowRep.includes(fname)) return true;
             if (rowAc.includes(fname)) return true;
          }
        }
      }
      return false;
    });
  }

  const rows = validRows.map(row =>
    buildRowArray(row, C, aux.bc, aux.cg, aux.cj, aux.sac, aux.dcp, nowTs)
  );

  rows.sort((a, b) => (parseFloat(b[QTOTAL_IDX]) || 0) - (parseFloat(a[QTOTAL_IDX]) || 0));

  return {
    success:    true,
    h:          HEADERS,
    d:          rows,
    total:      rows.length,
    importTime: '',
  };
}

// ─── REFRESH MANUAL ───────────────────────────────────────────────────────────
/**
 * Invalida la caché del usuario, consulta Metabase y devuelve datos frescos.
 * Equivale a refreshUserFromMetabase() del .gs original.
 */
async function refreshUserFromMetabase(userId) {
  const numId = parseInt(userId, 10);
  if (!userId || (isNaN(numId) && userId !== '0')) {
    return { success: false, error: 'ID inválido.' };
  }

  cache.del('dash_' + userId);

  try {
    const mbData = await fetchMetabaseRowsLive(userId);
    const result = await _assembleDashboard(mbData, userId);
    if (result.success) {
      cache.set('dash_' + userId, result, cache.TTL.DASHBOARD);
      return { ...result, fresh: true };
    }
    return result;
  } catch (e) {
    console.error('[logic] refreshUserFromMetabase error userId=' + userId + ':', e.message);
    return { success: false, error: e.message };
  }
}

// ─── WARM-UP ──────────────────────────────────────────────────────────────────
/**
 * Pre-genera la caché de todos los usuarios.
 * Reutiliza un único token Metabase para todos.
 * Equivale a warmUpAllUsersCache() del .gs original.
 * Llamado por el cron job diario (/api/warmUp).
 */
async function warmUpAllUsersCache() {
  const t0 = Date.now();
  console.log('[logic] warmUp: iniciando...');

  // Invalidar aux para datos frescos
  cache.del('aux_all');

  const data = await getSheetData('usuarios');
  const ids  = [];
  const seen = {};
  for (let i = 1; i < data.length; i++) {
    const uid = String(g(data[i], 3)).replace(/[^0-9]/g, '');
    if (uid && !seen[uid]) { seen[uid] = true; ids.push(uid); }
  }
  console.log('[logic] warmUp: ' + ids.length + ' usuarios encontrados');

  // Pre-cargar aux data una vez para todos
  await getAllAuxData();

  // Autenticar en Metabase una sola vez
  let tokenData;
  try {
    tokenData = await fetchMetabaseToken();
    console.log('[logic] warmUp: token Metabase obtenido');
  } catch (e) {
    console.error('[logic] warmUp: no pudo obtener token Metabase:', e.message);
    return { ok: false, error: e.message };
  }

  let okCount = 0, errCount = 0;
  for (const uid of ids) {
    try {
      const result = await _buildDashboard(uid, tokenData);
      if (result.success) { cache.set('dash_' + uid, result, cache.TTL.DASHBOARD); okCount++; }
      else { errCount++; console.warn('[logic] warmUp sin datos uid=' + uid + ':', result.error); }
    } catch (e) {
      errCount++;
      console.error('[logic] warmUp error uid=' + uid + ':', e.message);
    }
  }

  const elapsed = Date.now() - t0;
  console.log(`[logic] warmUp: ok=${okCount} err=${errCount} en ${elapsed}ms`);
  return { ok: true, users: ids.length, success: okCount, errors: errCount, ms: elapsed };
}

// ─── ADMIN HELPERS ───────────────────────────────────────────────────────────
async function getAllCommercials() {
  const data = await getSheetData('usuarios');
  const list = [];
  const seen = {};
  for (let i = 1; i < data.length; i++) {
    const name = String(g(data[i], 2)).trim();
    if (name && !seen[name]) { seen[name] = true; list.push(name); }
  }
  return list.sort();
}

async function getUserIdByName(name) {
  const data  = await getSheetData('usuarios');
  const lower = name.toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(g(data[i], 2)).trim().toLowerCase() === lower) {
      return String(g(data[i], 3));
    }
  }
  return null;
}

// ─── INVALIDAR CACHÉ ─────────────────────────────────────────────────────────
function invalidateAuxCache() {
  cache.del('aux_all');
  return { success: true, message: 'Caché de datos auxiliares limpiado.' };
}

function invalidateUserCache(userId) {
  cache.del('dash_' + userId);
  return { success: true, message: 'Caché de usuario ' + userId + ' limpiado.' };
}

function invalidateAllCache() {
  cache.flush();
  return { success: true, message: 'Todo el caché limpiado.' };
}

// ─── FORMATEO ─────────────────────────────────────────────────────────────────

function _fmtPct(val) {
  if (val == null || val === '') return '';
  const n = parseFloat(val);
  return isNaN(n) ? '' : Math.round(n * 100) + '%';
}

function _relTime(dateStr, nowTs) {
  if (!dateStr || dateStr === '-' || dateStr === '0000-01-01' || dateStr === 'null') return '';
  try {
    const ts = (dateStr instanceof Date) ? dateStr.getTime() : new Date(dateStr).getTime();
    if (isNaN(ts)) return '';
    const d = Math.floor((nowTs - ts) / 86400000);
    if (d < 1)  return 'hoy';
    if (d < 30) return d + 'd';
    const m = Math.floor(d / 30);
    if (m < 12) return m + 'm';
    const y = Math.floor(d / 365);
    return (y >= 5) ? '5a+' : y + 'a';
  } catch { return ''; }
}

function _formatDate(dateStr) {
  if (!dateStr || dateStr === '-' || dateStr === '0000-01-01' || dateStr === 'null') return '';
  try {
    const date = (dateStr instanceof Date) ? dateStr : new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const d  = date.getDate();
    const mo = date.getMonth() + 1;
    const y  = String(date.getFullYear()).slice(-2);
    return (d < 10 ? '0' + d : d) + '/' + (mo < 10 ? '0' + mo : mo) + '/' + y;
  } catch { return ''; }
}

function _parseNum(val) {
  if (val == null || val === '-' || val === '') return 0;
  let s = String(val).replace(/\s/g, '');
  if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') !== -1) s = s.replace(',', '.');
  return parseFloat(s) || 0;
}

function _fmtK(val) {
  if (val == null || val === '' || val === 0) return '';
  const s = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  if (isNaN(n) || n === 0) return '';
  return (n / 1000).toFixed(1) + 'k';
}

module.exports = {
  login,
  getDashboardData,
  refreshUserFromMetabase,
  getAllCommercials,
  getUserIdByName,
  warmUpAllUsersCache,
  invalidateAuxCache,
  invalidateUserCache,
  invalidateAllCache,
  getAllAuxData,
};

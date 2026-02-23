// ESTADO GLOBAL
let currentUser = null;
let allRows = [];
let allHeaders = [];
let allCommercialsList = [];
let currentSort = { col: 'Q total OP', asc: false };
let draggedCol = null;

// --- UTILS ---
async function apiFetch(endpoint, options = {}) {
    const response = await fetch(`/api/${endpoint}`, {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : null
    });
    return await response.json();
}

// --- SORTING ---
function handleSort(col) {
    if (currentSort.col === col) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.col = col;
        currentSort.asc = false;
    }
    renderTable(allHeaders, allRows);
}

function parseSortValue(val, col) {
    if (val === null || val === undefined || val === '-' || val === '') return -99999999;

    let s = String(val).toLowerCase().trim();

    // Relative time (hoy, 1d, 1m, 1a)
    if (s === 'hoy') return 0;
    if (s.indexOf('d') !== -1) return parseInt(s) || 0;
    if (s.indexOf('m') !== -1) return (parseInt(s) || 0) * 30;
    if (s.indexOf('a') !== -1) return (parseInt(s) || 0) * 365;

    // Percentages and formatted numbers
    let clean = s.replace('%', '').replace('m', '').replace(/[^0-9.-]/g, '');
    return parseFloat(clean) || 0;
}

// --- LOGIN ---
document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = document.getElementById('inp-email').value;
    const pass = document.getElementById('inp-pass').value;
    const btn = document.getElementById('btnLogin');
    const err = document.getElementById('loginErr');

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    err.textContent = '';

    try {
        const res = await apiFetch('login', {
            method: 'POST',
            body: { email, password: pass }
        });

        if (res.success) {
            currentUser = res; // {success, userId, name, email, isAdmin}
            showDashboard();
        } else {
            err.textContent = res.error;
            btn.disabled = false;
            btn.textContent = 'Iniciar Sesión';
        }
    } catch (error) {
        err.textContent = 'Error de conexión: ' + error.message;
        btn.disabled = false;
        btn.textContent = 'Iniciar Sesión';
    }
});

// --- DASHBOARD ---
function showDashboard() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dash-view').style.display = 'block';

    const userDisplay = document.getElementById('userName');
    userDisplay.textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();

    if (currentUser.isAdmin) {
        document.getElementById('adminControls').style.display = 'flex';
        populateCommercials();
    } else {
        document.getElementById('adminControls').style.display = 'none';
        fetchData(currentUser.userId);
    }
}

async function populateCommercials() {
    try {
        const list = await apiFetch('commercials');
        allCommercialsList = list;
        const bodyEl = document.getElementById('tBody');
        if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="100" class="empty-state">Seleccione un comercial arriba para comenzar el filtrado.</td></tr>';
    } catch (e) {
        console.error('Error fetching commercials', e);
    }
}

const acInput = document.getElementById('acInput');
const acResults = document.getElementById('acResults');

acInput.addEventListener('focus', function () {
    showACResults(allCommercialsList);
});

acInput.addEventListener('input', function () {
    const q = this.value.toLowerCase();
    const filtered = allCommercialsList.filter(name => name.toLowerCase().includes(q));
    showACResults(filtered);
});

document.addEventListener('click', function (e) {
    if (!e.target.closest('.ac-dropdown')) {
        acResults.style.display = 'none';
    }
});

function showACResults(list) {
    acResults.innerHTML = '';

    const allOpt = document.createElement('div');
    allOpt.textContent = 'Todas las Sociedades';
    allOpt.onclick = () => selectAC('', '0');
    acResults.appendChild(allOpt);

    list.forEach(name => {
        const div = document.createElement('div');
        div.textContent = name;
        div.onclick = () => selectAC(name);
        acResults.appendChild(div);
    });
    acResults.style.display = 'block';
}

function selectAC(name, forcedId) {
    acInput.value = name || 'Todas las Sociedades';
    acResults.style.display = 'none';
    handleACChange(forcedId || name);
}

async function handleACChange(nameOrId) {
    const headEl = document.getElementById('tHead');
    const bodyEl = document.getElementById('tBody');
    const countEl = document.getElementById('rowCount');
    if (headEl) headEl.innerHTML = '';
    if (bodyEl) bodyEl.innerHTML = '';
    if (countEl) countEl.textContent = '';
    allRows = [];

    if (nameOrId === '0' || nameOrId === '') {
        localStorage.removeItem('last_ac_name');
        document.getElementById('userName').textContent = "Vista Global";
        document.getElementById('userAvatar').textContent = "G";
        fetchData("0");
        return;
    }

    document.getElementById('spinner').style.display = 'block';
    localStorage.setItem('last_ac_name', nameOrId);

    document.getElementById('userName').textContent = nameOrId;
    document.getElementById('userAvatar').textContent = nameOrId.charAt(0).toUpperCase();

    try {
        const res = await apiFetch('user-id', {
            method: 'POST',
            body: { name: nameOrId }
        });

        if (res.id !== null && res.id !== undefined && res.id !== "") {
            fetchData(res.id);
        } else {
            document.getElementById('spinner').style.display = 'none';
            document.getElementById('tBody').innerHTML = '<tr><td colspan="100" class="empty-state">Error: No se encontró ID para "' + nameOrId + '".</td></tr>';
        }
    } catch (e) {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('tBody').innerHTML = '<tr><td colspan="100" class="empty-state">Error técnico: ' + e.message + '</td></tr>';
    }
}

async function fetchData(targetId) {
    const uid = targetId || currentUser.userId;
    document.getElementById('spinner').style.display = 'block';

    const headEl = document.getElementById('tHead');
    const bodyEl = document.getElementById('tBody');
    const countEl = document.getElementById('rowCount');
    if (headEl) headEl.innerHTML = '';
    if (bodyEl) bodyEl.innerHTML = '';
    if (countEl) countEl.textContent = 'Cargando datos...';
    allRows = [];

    try {
        const res = await apiFetch('dashboard', {
            method: 'POST',
            body: { userId: uid }
        });

        document.getElementById('spinner').style.display = 'none';
        if (res.success) {
            allHeaders = res.headers;
            allRows = res.data;
            renderTable(allHeaders, allRows);
        } else {
            document.getElementById('tBody').innerHTML = '<tr><td colspan="100" class="empty-state">Error: ' + res.error + '</td></tr>';
        }
    } catch (e) {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('tBody').innerHTML = '<tr><td colspan="100" class="empty-state">Error crítico: ' + e.message + '</td></tr>';
    }
}

function renderTable(headers, rows) {
    const headEl = document.getElementById('tHead');
    const bodyEl = document.getElementById('tBody');
    headEl.innerHTML = '';
    bodyEl.innerHTML = '';

    const countEl = document.getElementById('rowCount');
    if (countEl) countEl.textContent = rows.length + ' Sociedades';

    if (rows.length === 0) {
        bodyEl.innerHTML = '<tr><td colspan="100" class="empty-state">No se encontraron datos.</td></tr>';
        return;
    }

    headers.forEach((h, index) => {
        let th = document.createElement('th');
        th.style.userSelect = 'none';

        if (index > 0) {
            th.draggable = true;

            let handle = document.createElement('div');
            handle.className = 'drag-handle';
            th.appendChild(handle);

            th.ondragstart = (e) => {
                draggedCol = h;
                th.classList.add('dragging');
                e.dataTransfer.setData('text/plain', h);
            };

            th.ondragover = (e) => {
                e.preventDefault();
                if (draggedCol !== h) th.classList.add('drag-over');
            };

            th.ondragleave = () => th.classList.remove('drag-over');

            th.ondrop = (e) => {
                e.preventDefault();
                th.classList.remove('drag-over');
                const sourceCol = e.dataTransfer.getData('text/plain');
                if (sourceCol !== h) {
                    reorderHeaders(sourceCol, h);
                }
            };

            th.ondragend = () => th.classList.remove('dragging');
        }

        let contentWrap = document.createElement('div');
        contentWrap.style.cursor = 'pointer';

        const headerLabels = {
            'credito jd': 'credito<br>jd',
            'CCC ult 5': 'CCC<br>ult 5',
            'Fecha Creacion': 'fecha<br>creacion',
            'Ultimo ingreso': 'ultimo<br>ingreso',
            'q_usuarios': 'q<br>usuarios',
            'asociado_comercial': 'asociado<br>comercial'
        };

        let label = headerLabels[h] || h.replace(/_/g, ' ');
        if (currentSort.col === h) {
            label += currentSort.asc ? ' ▲' : ' ▼';
            contentWrap.style.color = '#3b82f6';
        }
        contentWrap.innerHTML = label;
        contentWrap.onclick = () => handleSort(h);

        th.appendChild(contentWrap);

        const fixedWidths = {
            'CCC': '70px',
            'CCC ult 5': '70px',
            'credito jd': '60px',
            'Kt': '80px',
            'Kv': '80px',
            'SAC': '50px',
            'q_usuarios': '60px'
        };
        if (fixedWidths[h]) {
            th.style.width = fixedWidths[h];
            th.style.minWidth = fixedWidths[h];
        }

        if (h.indexOf('(F)') !== -1) {
            th.style.backgroundColor = '#1e3a8a';
            th.style.color = '#fff';
            th.style.borderLeft = '1px solid #3b82f6';
        } else if (h.indexOf('(I)') !== -1) {
            th.style.backgroundColor = '#7f1d1d';
            th.style.color = '#fff';
            th.style.borderLeft = '1px solid #ef4444';
        }

        headEl.appendChild(th);
    });

    function reorderHeaders(source, target) {
        const fromIdx = headers.indexOf(source);
        const toIdx = headers.indexOf(target);
        if (fromIdx === -1 || toIdx === -1) return;
        headers.splice(fromIdx, 1);
        headers.splice(toIdx, 0, source);
        renderTable(headers, rows);
    }

    const sortedRows = [...rows].sort((a, b) => {
        let v1 = parseSortValue(a[currentSort.col], currentSort.col);
        let v2 = parseSortValue(b[currentSort.col], currentSort.col);
        if (v1 < v2) return currentSort.asc ? -1 : 1;
        if (v1 > v2) return currentSort.asc ? 1 : -1;
        return 0;
    });

    sortedRows.forEach(row => {
        let tr = document.createElement('tr');
        headers.forEach(h => {
            let td = document.createElement('td');
            let val = row[h];
            let textDisplay = (val !== null && val !== undefined && val !== '') ? val : '';

            if (['DCP', 'CI FAE', 'CI INV', 'Q total OP', 'FUOp', 'FUAct'].indexOf(h) !== -1) {
                td.style.textAlign = 'center';
                td.style.fontWeight = '500';
            }

            if (h === 'Kt' || h === 'Kv') {
                td.textContent = textDisplay;
                let num = parseFloat(String(val).replace(',', '.'));
                if (!isNaN(num)) {
                    td.style.textAlign = 'center';
                    td.style.fontWeight = '700';
                    td.style.borderRadius = '4px';
                    if (num > 10000) { td.style.backgroundColor = '#99b755'; td.style.color = '#000'; }
                    else if (num < 5000) { td.style.backgroundColor = '#b45f06'; td.style.color = '#fff'; }
                    else { td.style.backgroundColor = '#999999'; td.style.color = '#fff'; }
                }
            }
            else if (h === '% u' || h.indexOf('CCC') !== -1 || h.indexOf('DCP') !== -1) {
                let cleanVal = String(val).replace('%', '').replace(',', '.');
                let num = parseFloat(cleanVal);
                if ((h.indexOf('CCC') !== -1 || h.indexOf('DCP') !== -1) && String(val).indexOf('%') !== -1) {
                    num = num / 100;
                }
                if (!isNaN(num)) {
                    td.textContent = (h.indexOf('CCC') !== -1 || h.indexOf('DCP') !== -1 || h === '% u') ? Math.round(num * 100) + '%' : textDisplay;
                    td.style.textAlign = 'center';
                    td.style.fontWeight = '700';
                    td.style.borderRadius = '4px';
                    td.style.backgroundColor = getScaleColor(num);
                    td.style.color = '#000';
                } else {
                    td.textContent = textDisplay;
                }
            }
            else if (h.indexOf('(F)') !== -1) {
                td.textContent = textDisplay;
                td.style.backgroundColor = 'rgba(37, 99, 235, 0.08)';
                td.style.borderLeft = '1px solid rgba(59, 130, 246, 0.2)';
                td.style.color = '#93c5fd';
            }
            else if (h.indexOf('(I)') !== -1) {
                td.textContent = textDisplay;
                td.style.backgroundColor = 'rgba(220, 38, 38, 0.08)';
                td.style.borderLeft = '1px solid rgba(239, 68, 68, 0.2)';
                td.style.color = '#fca5a5';
            }
            else {
                td.textContent = textDisplay;
            }
            tr.appendChild(td);
        });
        bodyEl.appendChild(tr);
    });
}

function getScaleColor(value) {
    value = Math.max(0, Math.min(1, value));
    let r, g, b;
    if (value <= 0.5) {
        let f = value * 2;
        r = Math.round(230 + (255 - 230) * f);
        g = Math.round(124 + (255 - 124) * f);
        b = Math.round(115 + (255 - 115) * f);
    } else {
        let f = (value - 0.5) * 2;
        r = Math.round(255 + (87 - 255) * f);
        g = Math.round(255 + (187 - 255) * f);
        b = Math.round(255 + (138 - 255) * f);
    }
    return `rgb(${r}, ${g}, ${b})`;
}

// --- BÚSQUEDA LOCAL ---
document.getElementById('searchInput').addEventListener('input', function (e) {
    const q = e.target.value.toLowerCase();
    const filtered = allRows.filter(row => {
        return Object.values(row).some(val => String(val).toLowerCase().includes(q));
    });
    renderTable(allHeaders, filtered);
});

// --- LOGOUT ---
document.getElementById('btnLogout').addEventListener('click', function () {
    currentUser = null;
    allRows = [];
    allHeaders = [];
    const headEl = document.getElementById('tHead');
    const bodyEl = document.getElementById('tBody');
    const countEl = document.getElementById('rowCount');
    if (headEl) headEl.innerHTML = '';
    if (bodyEl) bodyEl.innerHTML = '';
    if (countEl) countEl.textContent = '';
    document.getElementById('dash-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'flex';
    document.getElementById('loginForm').reset();
    const btn = document.getElementById('btnLogin');
    btn.disabled = false;
    btn.textContent = 'Iniciar Sesión';
});

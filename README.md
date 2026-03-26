# DCAC CRM Dashboard — Migración Apps Script → Vercel

## Estructura del proyecto

```
/
├── api/
│   ├── _lib/
│   │   ├── sheets.js                ← Google Sheets API (Service Account)
│   │   ├── cache.js                 ← Cache en memoria
│   │   ├── metabase.js              ← Cliente Metabase API
│   │   ├── auth.js                  ← Tokens HMAC (sin dependencias extra)
│   │   └── logic.js                 ← TODA la lógica de negocio
│   ├── login.js                     ← POST /api/login
│   ├── getDashboardData.js          ← GET  /api/getDashboardData?userId=...
│   ├── refreshUserFromMetabase.js   ← POST /api/refreshUserFromMetabase
│   ├── getAllCommercials.js         ← GET  /api/getAllCommercials
│   ├── getUserIdByName.js           ← GET  /api/getUserIdByName?name=...
│   ├── warmUp.js                    ← GET  /api/warmUp  ← cron diario 8 AM ARG
│   └── invalidateCache.js           ← POST /api/invalidateCache
├── public/
│   └── index.html                   ← Frontend (idéntico visualmente + login real)
├── package.json
├── vercel.json                      ← Routes + Cron Jobs
├── .env.example
└── README.md
```

## Tabla de equivalencias Apps Script → Vercel

| Apps Script                    | Vercel/Node                              |
|-------------------------------|------------------------------------------|
| `SpreadsheetApp.openById()`   | `googleapis` con Service Account        |
| `PropertiesService`           | Variables de entorno (`.env`)            |
| `CacheService`                | Cache en memoria (`api/_lib/cache.js`)   |
| `UrlFetchApp.fetch()`         | `fetch()` nativo (Node 18)               |
| `Session.getActiveUser()`     | Token JWT en `Authorization` header      |
| `google.script.run`           | `fetch('/api/...')` con Bearer token     |
| Trigger diario                | Vercel Cron Job (vercel.json)            |
| `Logger.log()`                | `console.log()` → Vercel Logs            |

## Variables de entorno

| Variable                    | Descripción                                          |
|-----------------------------|------------------------------------------------------|
| `GOOGLE_SERVICE_ACCOUNT_KEY`| JSON completo de la clave de la Service Account       |
| `SPREADSHEET_ID`            | ID del Google Spreadsheet                            |
| `METABASE_BASE_URL`         | URL base de Metabase (ej: https://metabase.co)       |
| `METABASE_USERNAME`         | Email del usuario Metabase                           |
| `METABASE_PASSWORD`         | Contraseña Metabase                                  |
| `METABASE_QUESTION_ID`      | ID de la Question de Metabase (default: 64)          |
| `JWT_SECRET`                | Secreto para firmar tokens de sesión                 |
| `WARM_UP_SECRET`            | Secreto para llamadas manuales al warm-up            |

## Setup paso a paso

### 1. Google Service Account
1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto (o usar uno existente)
3. Activar la **Google Sheets API**
4. Crear una **Service Account** en IAM → Service Accounts
5. Generar una **clave JSON** y descargarla
6. **Compartir el Spreadsheet** con el email de la service account (permisos de Lectura)

### 2. Variables de entorno en Vercel
En Vercel Dashboard → tu proyecto → Settings → Environment Variables,
agregar todas las variables del `.env.example`.

**Importante para `GOOGLE_SERVICE_ACCOUNT_KEY`:**
Pegar el JSON completo en una sola línea. En la terminal:
```bash
cat clave-servicio.json | tr -d '\n'
```

### 3. Deploy
```bash
npm i -g vercel
vercel
```
O conectar el repo en vercel.com y hacer push a main.

### 4. Desarrollo local
```bash
npm install
cp .env.example .env.local
# Editar .env.local con los valores reales
vercel dev
```

## Cron Job (warm-up diario)

El archivo `vercel.json` configura:
```json
{
  "crons": [{ "path": "/api/warmUp", "schedule": "0 11 * * *" }]
}
```
- `0 11 * * *` = 11 AM UTC = 8 AM Argentina (UTC-3)
- Vercel llama al endpoint con un header `Authorization: Bearer <CRON_SECRET>`
- Equivale exactamente al trigger `setupDailyWarmUp()` del Apps Script original

Para ejecutar el warm-up manualmente:
```
GET https://tu-app.vercel.app/api/warmUp?secret=TU_WARM_UP_SECRET
```

## Notas sobre el login

El original tenía un bypass de auto-login (la pantalla de login nunca aparecía).
En esta versión el login está **activado correctamente** ya que es una app pública en Vercel.

- La sesión persiste en `localStorage` (token HMAC de 12 horas)
- El token se renueva automáticamente al volver a iniciar sesión
- El logout limpia el token del localStorage

## Notas sobre el caché

El caché en memoria de Node.js:
- **Dashboard por usuario**: 24 horas
- **Datos auxiliares (Sheets)**: 2 horas
- Se resetea en cold starts (Vercel reinicia la función)
- El warm-up diario pre-carga todos los dashboards a las 8 AM

Para producción con alto tráfico, reemplazar `api/_lib/cache.js` con
[Upstash Redis](https://upstash.com/) (compatible con Vercel Edge).

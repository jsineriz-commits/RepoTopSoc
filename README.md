# CRM Dashboard V2 - Vercel Migration

Este proyecto es una migración del CRM Dashboard original de Google Apps Script a una arquitectura de aplicación web moderna lista para desplegar en **Vercel**.

## Estructura del Proyecto
- `/api`: Serveless Functions (Node.js) que reemplazan la lógica de `Código.js`.
- `/src`: Frontend refactorizado (HTML, CSS y JS separados).
- `/public`: Activos estáticos.

## Requisitos Previos para el Despliegue

### 1. Configuración de Google Cloud (Service Account)
Para que Vercel pueda leer tus Google Sheets sin estar "dentro" de Google:
1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto nuevo.
3. Habilita la **Google Sheets API**.
4. Crea una **Service Account** (Cuenta de Servicio).
5. Genera una **clave JSON** para esa cuenta y descárgala.
6. **IMPORTANTE:** Comparte tu archivo de Google Sheets con el email de la Service Account (con permisos de lector).

### 2. Variables de Entorno en Vercel
Debes configurar las siguientes variables en el panel de Vercel:

| Variable | Descripción |
| :--- | :--- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | El JSON completo de la clave que descargaste. |
| `GOOGLE_PRIVATE_KEY` | La clave privada que está dentro del JSON. |
| `GOOGLE_SHEET_ID` | El ID de tu Google Sheet (está en la URL). |
| `METABASE_BASE_URL` | La URL de tu instancia de Metabase. |
| `METABASE_USERNAME` | Usuario de Metabase. |
| `METABASE_PASSWORD` | Contraseña de Metabase. |
| `METABASE_QUESTION_ID` | El ID de la consulta (ej: 4557). |

## Desarrollo Local
1. Instala dependencias: `npm install`
2. Instala Vercel CLI: `npm i -g vercel`
3. Corre el proyecto localmente: `vercel dev`

## Despliegue a GitHub
1. Crea un repositorio vacío en GitHub.
2. Sigue las instrucciones de GitHub para "push an existing repository":
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Vercel migration"
   git branch -M main
   git remote add origin https://github.com/tu-usuario/tu-repo.git
   git push -u origin main
   ```
3. Conecta el repo en el panel de Vercel.

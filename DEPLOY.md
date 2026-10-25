# Guía de Despliegue en Producción
**Todo en Railway — un solo servicio, una sola URL**

> ✅ **DEPLOY ACTIVO** — 12 de mayo de 2026 (última actualización 30 de mayo de 2026)
> **URL de producción:** (definida por cada despliegue)
>
> Cada `git push origin master` redespliega automáticamente en ~2-3 minutos.

---

## Arquitectura en producción

```
Usuario
  ↓
Railway (un solo servicio)
  https://tu-proyecto.up.railway.app
  │
  ├── GET /            → React (frontend/dist/index.html)
  ├── GET /assets/*    → JS, CSS, imágenes del build de React
  └── POST /api/*      → Express (rutas del backend)
        ↓
        Google Cloud Document AI + Gemini API
```

Express sirve el frontend y la API desde el mismo servidor. Sin CORS, sin dos URLs.

---

## Paso 1 — Subir el código a GitHub

Verificar que `.gitignore` excluya los archivos sensibles:

```bash
git status
# No deben aparecer:
# backend/.env
# backend/credenciales/*.json
# frontend/.env.local
```

---

## Paso 2 — Crear el proyecto en Railway

1. Ir a [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Seleccionar el repositorio `proyectoUTS`
3. Railway usará el `railway.json` de la raíz del proyecto automáticamente:
   - **Build:** `npm install --workspaces && npm run build` (instala todo + construye React)
   - **Start:** `node backend/server.js`

---

## Paso 3 — Configurar variables de entorno en Railway

En el panel de Railway → pestaña **Variables**, agregar:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `GEMINI_API_KEY` | Tu API key de Google AI Studio |
| `DOCUMENT_AI_PROJECT_ID` | ID de tu proyecto de Google Cloud |
| `DOCUMENT_AI_LOCATION` | `us` |
| `DOCUMENT_AI_PROCESSOR_ID` | ID del procesador OCR de Document AI |
| `GOOGLE_CREDENTIALS_JSON` | *(ver paso 4)* |
| `SUPABASE_URL` | URL del proyecto Supabase (ej. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | service_role key de Supabase (pestaña API → Service Role) |
| `ADMIN_TOKEN` | Token hexadecimal de 48 caracteres para proteger el panel admin |

> **Nota de seguridad:** `SUPABASE_SERVICE_KEY` y `ADMIN_TOKEN` nunca deben estar en el código fuente ni en variables de entorno del frontend. Solo residen en las variables del servidor Railway.

## Paso 4 — Credenciales de Google Cloud en Railway

Las credenciales GCP están en un archivo JSON local que no puede subirse al repositorio. Se inyectan como variable de entorno:

1. Abrir el archivo JSON de la cuenta de servicio (en `backend/credenciales/`)
2. Copiar **todo el contenido** del JSON (Ctrl+A, Ctrl+C en el archivo)
3. En Railway → Variables → agregar:
   - Nombre: `GOOGLE_CREDENTIALS_JSON`
   - Valor: pegar el contenido completo

4. Ajustar `backend/services/ocr.service.js` para leer las credenciales desde esa variable en producción — esto lo hacemos juntos cuando vayas a hacer el deploy.

---

## Paso 5 — Verificar el deploy

Railway mostrará los logs del build. El flujo esperado:

```
Installing dependencies...    ← npm install --workspaces
Building frontend...          ← npm run build (Vite genera frontend/dist/)
Starting server...            ← node backend/server.js
Servidor backend corriendo en http://localhost:3001
```

Cuando aparezca el mensaje del servidor, la URL pública ya está activa.

---

## Desarrollo local (sin cambios)

El flujo local sigue igual que antes:

```bash
npm run dev:backend   # http://localhost:3001
npm run dev:frontend  # http://localhost:5173 (con proxy a 3001)
```

El proxy de Vite redirige `/api/*` al backend en desarrollo, igual que siempre.

---

## Solución de problemas comunes

| Problema | Causa probable | Solución |
|---|---|---|
| Página en blanco al navegar directo a una ruta | React Router necesita que Express devuelva `index.html` | Ya configurado en `app.js` con `app.get('*', ...)` |
| Error de credenciales GCP | `GOOGLE_CREDENTIALS_JSON` mal formateado | Verificar que el JSON sea válido (sin saltos de línea extra) |
| Timeout en documentos grandes | Primera petición tras inactividad (cold start) | Esperar ~30 seg en el primer uso del día |
| `Cannot GET /api/documentos/analizar` | `NODE_ENV` no está en `production` | Verificar la variable en Railway |


---

## Solución de problemas comunes

| Problema | Causa probable | Solución |
|---|---|---|
| Página en blanco al navegar directo a una ruta | React Router necesita que Express devuelva `index.html` | Ya configurado en `app.js` con `app.get('*', ...)` |
| Error de credenciales GCP | `GOOGLE_CREDENTIALS_JSON` mal formateado | Verificar que el JSON sea válido (sin saltos de línea extra) |
| Timeout en documentos grandes | Primera petición tras inactividad (cold start) | Esperar ~30 seg en el primer uso del día |
| `Cannot GET /api/documentos/analizar` | `NODE_ENV` no está en `production` | Verificar la variable en Railway |
| Error 401 en panel admin | `ADMIN_TOKEN` con caracteres especiales copiados incorrectamente | Usar token hexadecimal sin caracteres especiales |
| Error de Supabase | `SUPABASE_URL` o `SUPABASE_SERVICE_KEY` mal configuradas | Verificar en Supabase → Settings → API |

---

## Comandos útiles post-deploy

```bash
# Ver logs del backend en Railway CLI
railway logs

# Forzar redeploy manual
git commit --allow-empty -m "trigger redeploy" && git push origin master
```

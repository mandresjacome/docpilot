# Despliegue en Railway

DocPilot se despliega como **un único servicio**: Express sirve la API y el frontend compilado desde el mismo origen. Esta guía usa Railway, pero cualquier plataforma que ejecute Node.js sirve igual.

```
Navegador ──▶ Railway (un servicio Node.js)
               ├─ GET  /        → frontend/dist (React compilado)
               └─ /api/*        → Express ──▶ Google Document AI · Gemini · Supabase
```

## 1. Repositorio

Comprueba que no se suba nada sensible:

```bash
git status
# No deben aparecer: backend/.env, backend/credenciales/*, frontend/.env.local
```

## 2. Crear el servicio

1. En Railway: **New Project → Deploy from GitHub repo** y elige el repositorio.
2. Railway lee `railway.json` de la raíz:
   - **Build:** `npm install --workspaces --include=dev && npm run build` (instala todo y compila el frontend con Vite).
   - **Start:** `node backend/server.js`.
3. Cada `git push` a la rama configurada redespliega automáticamente.

## 3. Variables de entorno

Define en la pestaña **Variables** (descripción completa de cada una en el [README](../README.md#variables-de-entorno)):

| Variable | Valor |
|----------|-------|
| `NODE_ENV` | `production` (sirve el frontend compilado y desactiva CORS) |
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Clave `service_role` |
| `GEMINI_API_KEY` | API key de Gemini |
| `DOCUMENT_AI_PROJECT_ID` | ID de tu proyecto de Google Cloud |
| `DOCUMENT_AI_LOCATION` | `us` o `eu`, según tu procesador |
| `DOCUMENT_AI_PROCESSOR_ID` | ID del procesador OCR |
| `GOOGLE_CREDENTIALS_JSON` | Contenido completo del JSON de la cuenta de servicio (ver abajo) |
| `ADMIN_TOKEN` | Cadena larga y aleatoria (p. ej. `openssl rand -hex 32`) |

No definas `PORT`: Railway lo inyecta. No definas `VITE_API_URL`: frontend y API comparten origen y el frontend usa la ruta relativa `/api`.

> `SUPABASE_SERVICE_KEY`, `ADMIN_TOKEN` y las credenciales de Google solo deben existir como variables del servidor. Nunca en el código, en el repositorio ni en variables `VITE_*` (estas se incrustan en el JavaScript público).

## 4. Credenciales de Google Cloud

Railway no puede leer archivos locales, así que el JSON de la cuenta de servicio se inyecta como variable:

1. Abre el JSON de la cuenta de servicio (rol *Document AI API User*).
2. Copia **todo** su contenido.
3. Pégalo como valor de `GOOGLE_CREDENTIALS_JSON`.

`ocr.service.js` usa esa variable si existe; si no, recurre a `GOOGLE_APPLICATION_CREDENTIALS` (desarrollo local).

## 5. Base de datos

Ejecuta [supabase-schema.sql](supabase-schema.sql) en el SQL Editor de tu proyecto Supabase antes del primer análisis.

## 6. Verificar

En los logs de despliegue deben verse la instalación, el build de Vite y finalmente:

```
Servidor backend corriendo en http://localhost:<puerto>
```

Después:

- Abre la URL pública: debe cargar la aplicación.
- Sube un documento de prueba y comprueba que aparece el análisis.
- Verifica en el panel admin (pestaña *Admin*, con tu `ADMIN_TOKEN`) que el registro se creó.

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| La app no arranca y el log menciona `SUPABASE_URL` | Faltan variables de Supabase (se validan al arrancar) | Defínelas y redespliega |
| `GOOGLE_CREDENTIALS_JSON no es un JSON válido` | JSON incompleto o con comillas/saltos alterados al pegarlo | Copia de nuevo el contenido completo del archivo |
| Respuesta `502` con código `OCR_AUTENTICACION_FALLIDA` | Credenciales de Google incorrectas o sin permisos | Revisa la cuenta de servicio y su rol |
| Respuesta `502` con código `OCR_FALLIDO` | Procesador, región o proyecto incorrectos | Revisa `DOCUMENT_AI_*` |
| Respuesta `502` con código `IA_NO_DISPONIBLE` | API key inválida, cuota agotada o servicio caído | Revisa `GEMINI_API_KEY` y la cuota |
| Respuesta `502` con código `PERSISTENCIA_FALLIDA` | Supabase inaccesible, clave incorrecta o tabla inexistente | Revisa las variables y ejecuta el esquema SQL |
| El análisis funciona pero aparece la advertencia de "registro de uso no guardado" | Falló solo el insert en Supabase | Mira el log del servidor (`[Error 502] (PERSISTENCIA_FALLIDA)`) |
| `401` en el panel admin | Token incorrecto | Comprueba `ADMIN_TOKEN` (sin espacios ni saltos de línea) |
| `503` en el panel admin | `ADMIN_TOKEN` no está definida | Defínela en el servidor |

## Desarrollo local

Ver [README → Ejecución](../README.md#ejecución).

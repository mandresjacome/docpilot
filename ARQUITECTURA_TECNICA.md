# Arquitectura Técnica — Guía de Referencia Rápida
**Aplicación web con IA para la gestión documental en Mipymes de Bucaramanga**

> Este documento responde a la pregunta: **"¿Qué archivo hace qué y cómo se conecta todo?"**
> Es de uso interno para la sustentación del proyecto de grado.

---

## Mapa de archivos del proyecto

```
proyectoUTS/
│
├── backend/                      ← Servidor Node.js + Express
│   ├── server.js                 ← Punto de arranque: levanta el servidor en el puerto
│   ├── app.js                    ← Configura Express: CORS, rutas, archivos estáticos
│   │
│   ├── routes/
│   │   ├── documento.routes.js   ← Mapea URLs → controladores (solo eso)
│   │   ├── visita.routes.js      ← Registro de consentimiento de tratamiento de datos
│   │   └── admin.routes.js       ← Panel de administración (protegido por token)
│   │
│   ├── middlewares/
│   │   ├── validarArchivo.js     ← Recibe y valida el archivo (multer, Zero Storage)
│   │   └── errorHandler.js       ← Captura todos los errores y devuelve JSON al cliente
│   │
│   ├── controllers/
│   │   ├── documento.controller.js ← Orquesta OCR → Gemini → Supabase → responde
│   │   ├── visita.controller.js    ← Registra consentimiento en logs de servidor
│   │   └── admin.controller.js     ← Agrega métricas de uso para la profe
│   │
│   └── services/
│       ├── ocr.service.js        ← Habla con Google Cloud Document AI (extrae texto)
│       ├── gemini.service.js     ← Habla con Google Gemini (clasifica y analiza)
│       └── supabase.service.js   ← Persiste metadatos de uso en Supabase
│
└── frontend/                     ← Aplicación React (Vite)
    └── src/
        ├── App.jsx               ← Componente raíz: define las pestañas de navegación
        ├── pages/
        │   ├── PaginaAnalisis.jsx   ← Página principal: coordina todo el flujo de UI
        │   ├── PaginaAcercaDe.jsx   ← Ficha técnica institucional del proyecto
        │   └── PaginaAdmin.jsx      ← Dashboard de métricas (protegido por token)
        ├── components/
        │   ├── FormularioDocumento.jsx      ← Formulario de carga del archivo
        │   ├── ResultadoAnalisis.jsx        ← Muestra el JSON de la IA al usuario
        │   ├── VistaDividida.jsx            ← Vista lado a lado: documento + análisis
        │   ├── ModalTratamientoDatos.jsx    ← Modal de consentimiento Ley 1581/2012
        │   └── EncuestaUtilidad.jsx         ← Encuesta de satisfacción post-HITL
        └── services/
            ├── documento.service.js    ← Hace las llamadas HTTP al backend
            └── admin.service.js        ← Llamadas al endpoint del panel admin
```

---

## Flujo completo paso a paso — con archivo responsable

```
[1] Usuario selecciona el archivo en el navegador
        → FormularioDocumento.jsx valida tipo y tamaño en el cliente (sin llamada al servidor)

[2] Usuario hace clic en "Analizar"
        → PaginaAnalisis.jsx llama a documento.service.js → analizarDocumento(archivo)

[3] documento.service.js arma un FormData y hace POST /api/documentos/analizar
        → El archivo viaja como multipart/form-data al backend

[4] En el backend, la petición pasa primero por validarArchivo.js (middleware)
        → multer con memoryStorage() guarda el archivo en RAM como Buffer
        → Valida que sea PDF/PNG/JPEG/TIFF y no supere 10 MB
        → Si falla: lanza error 400 y el flujo termina aquí (errorHandler.js responde)

[5] documento.controller.js recibe req.file.buffer (el archivo en RAM)
        → Registra tiempoInicio = Date.now() para medir duración del procesamiento
        → Llama a ocrService.extraerTexto(buffer, mimeType)

[6] ocr.service.js codifica el buffer en base64 y lo envía por HTTPS a Document AI
        → Si el PDF tiene más de 14 páginas: lo divide en trozos con pdf-lib (en RAM)
        → Procesa cada trozo y concatena el texto
        → Devuelve el texto extraído como string plano

[7] documento.controller.js toma el texto extraído y llama a geminiService.analizarTexto(texto)

[8] gemini.service.js ejecuta el análisis en DOS FASES:
        → Fase 1 (clasificación): Gemini lee el texto y devuelve una categoría
          (contrato / factura / pqrs / documento_judicial / carta / cotizacion / otro)
        → Fase 2 (extracción): según la categoría, se aplica un prompt especializado
          que extrae los campos que realmente importan para ese tipo de documento
        → Devuelve un objeto JavaScript con el análisis completo

[9] documento.controller.js calcula tiempo_ms = Date.now() - tiempoInicio
        → Llama a supabaseService.registrarUsoConRetorno(tipo, tiempo_ms)
        → Supabase inserta un registro con: tipo_documento, tiempo_ms, confirmado=false
        → Retorna el UUID del registro (registroId) para vincularlo con la encuesta futura
        → ZERO STORAGE: solo metadatos del análisis, nunca el contenido del documento

[10] documento.controller.js responde con res.status(200).json({ datos: analisis, registroId })
        → El buffer en RAM queda fuera de scope y el Garbage Collector lo libera
        → ZERO STORAGE: el archivo NUNCA tocó el disco del servidor

[11] PaginaAnalisis.jsx recibe el JSON y lo pasa a VistaDividida.jsx
        → Panel izquierdo: previsualización del documento con iframe/img
        → Panel derecho: ResultadoAnalisis.jsx con el análisis de la IA

[12] El usuario lee el análisis y la sugerencia de respuesta
        → El botón y el título de la sección cambian según el tipo de documento:
          - Documentos con destinatario (contrato, pqrs, carta, judicial): "Copiar sugerencia de respuesta"
          - Documentos de gestión interna (factura, cotización, otro): "Entendido, finalizar análisis"
        → Si acepta: hace clic en el botón → documento.service.js llama a
          POST /api/documentos/confirmar con el registroId
        → documento.controller.js llama a supabaseService.marcarConfirmado(registroId)
        → HUMAN-IN-THE-LOOP: ninguna acción ocurrió hacia terceros sin la aprobación explícita

[13] Tras la confirmación HITL, aparece la encuesta de utilidad (EncuestaUtilidad.jsx)
        → Opcional: el usuario puede calificar 1-5 estrellas, tiempo ahorrado y comentario
        → Si envía: POST /api/documentos/encuesta → supabaseService.registrarEncuesta(registroId, datos)
        → Si omite: el ciclo termina igual, sin bloquear el flujo
```

---

## Los dos servicios de IA — detalle técnico

### `ocr.service.js` — Google Cloud Document AI

| Qué hace | Cómo lo hace |
|----------|-------------|
| Recibe el buffer del archivo en RAM | Viene de `req.file.buffer` vía multer |
| Convierte a base64 | `buffer.toString('base64')` |
| Envía a Document AI por HTTPS | `https.request()` nativo de Node.js |
| Autentica con GCP | `GoogleAuth` con credenciales de variable de entorno |
| Maneja PDFs de más de 14 páginas | `dividirPDFEnTrozos()` usando `pdf-lib` en memoria |
| Devuelve texto plano | `respuesta.document.text` |

**¿Por qué usa `https` nativo y no `axios`?**
Porque las librerías intermedias (`gaxios`, `axios`) introducían transformaciones inesperadas en el body JSON con documentos grandes. El módulo `https` de Node.js envía exactamente lo que se le indica.

**¿Dónde están las credenciales de GCP?**
- **Desarrollo local:** variable de entorno `GOOGLE_APPLICATION_CREDENTIALS` apunta al archivo JSON en `backend/credenciales/`
- **Producción (Railway):** el contenido del JSON se inyecta completo como variable `GOOGLE_CREDENTIALS_JSON`

---

### `gemini.service.js` — Google Gemini 2.5 Flash

| Qué hace | Cómo lo hace |
|----------|-------------|
| Recibe el texto extraído por OCR | String plano con todo el contenido del documento |
| Fase 1: Clasifica el documento | Prompt liviano → Gemini devuelve una de 7 categorías |
| Fase 2: Extrae datos relevantes | Prompt especializado por categoría → Gemini devuelve JSON |
| Limpia el JSON de Gemini | `limpiarJSON()` elimina los bloques de código ` ```json ``` ` que Gemini a veces incluye |
| Devuelve objeto JavaScript | `JSON.parse()` sobre la respuesta limpia |

**¿Por qué dos llamadas a Gemini en lugar de una?**
Una sola llamada para clasificar Y extraer en un único prompt genérico producía resultados inconsistentes: el modelo no sabía qué campos priorizar. Con dos llamadas:
1. Primero se sabe el tipo → esto define qué prompt aplicar.
2. El segundo prompt ya es especializado → extracción de alta calidad.

**Prompts especializados disponibles:**
| Categoría | Campos clave extraídos |
|-----------|----------------------|
| `contrato` | Partes, objeto, valor/pago, vigencia, obligaciones, cláusulas de riesgo |
| `factura` | Número, emisor, receptor, fechas, subtotal, IVA, total, estado de pago |
| `pqrs` | Remitente, motivo, solicitud concreta, plazo legal (Ley 1755/2015) |
| `documento_judicial` | Autoridad, expediente, partes, orden, plazos, consecuencias |
| `carta` | Remitente, destinatario, asunto, acción requerida |
| `cotizacion` | Proveedor, ítems, total, vigencia, condiciones de pago |
| `otro` | Análisis genérico para documentos institucionales/académicos |

---

## Las dos reglas de oro — implementación verificable en el código

### Zero Storage — ¿dónde está en el código?

```javascript
// backend/middlewares/validarArchivo.js — LÍNEA CLAVE
const storage = multer.memoryStorage(); // ← el archivo va a RAM, nunca al disco
```

```javascript
// backend/controllers/documento.controller.js
const buffer = req.file.buffer; // ← se usa y se descarta al salir del bloque try
```

```javascript
// backend/services/ocr.service.js
const contenidoBase64 = bufferChunk.toString('base64'); // ← se envía a GCP como base64
// No hay ningún fs.writeFile ni fs.writeFileSync en todo el proyecto
```

### Human-in-the-Loop — ¿dónde está en el código?

```javascript
// backend/routes/documento.routes.js
router.post('/confirmar', documentoController.confirmar);
// Este endpoint NUNCA se llama automáticamente.
// Solo se llama cuando el usuario hace clic en "Confirmar" en el frontend.
```

```javascript
// backend/controllers/documento.controller.js
// El endpoint /analizar SOLO devuelve la respuesta al frontend.
// No envía correos, no modifica datos externos, no actúa por su cuenta.
res.status(200).json({
  mensaje: 'Documento analizado correctamente. Por favor revise el resultado.',
  datos: analisis, // ← el usuario debe revisar esto antes de cualquier acción
});
```

---

## Arquitectura de despliegue en producción

```
Railway (un solo servicio)
│
└── Node.js server (puerto dinámico de Railway)
    │
    ├── GET /             → sirve frontend/dist/index.html (React compilado)
    ├── GET /assets/*     → sirve JS, CSS e imágenes del build de Vite
    ├── POST /api/documentos/analizar   → flujo OCR + Gemini + insert Supabase
    ├── POST /api/documentos/confirmar  → marcar confirmado en Supabase (HITL)
    ├── POST /api/documentos/encuesta   → guardar valoración en Supabase
    ├── POST /api/visitas/registrar     → log de consentimiento (solo console.log)
    ├── GET  /api/admin/dashboard       → métricas agregadas (header x-admin-token)
    ├── DELETE /api/admin/registros/:id → elimina un registro individual (header x-admin-token)
    └── DELETE /api/admin/registros     → elimina todos los registros (header x-admin-token)
          ↕
        Supabase (PostgreSQL) — tabla registros_uso
        [solo metadatos: tipo, tiempo_ms, confirmado, estrellas, tiempo_ahorrado]
```

**¿Por qué no hace falta CORS en producción?**
Porque el frontend y el backend viven en el mismo servidor y el mismo dominio. No hay solicitudes cross-origin. CORS solo se activa en desarrollo local (`NODE_ENV !== 'production'`), donde el frontend corre en `localhost:5173` y el backend en `localhost:3001`.

---

## Variables de entorno necesarias

| Variable | Dónde se usa | Para qué |
|----------|-------------|---------|
| `GEMINI_API_KEY` | `gemini.service.js` | Autenticar con Google Gemini AI Studio |
| `DOCUMENT_AI_PROJECT_ID` | `ocr.service.js` | ID del proyecto en Google Cloud |
| `DOCUMENT_AI_LOCATION` | `ocr.service.js` | Región del procesador (`us` o `eu`) |
| `DOCUMENT_AI_PROCESSOR_ID` | `ocr.service.js` | ID único del procesador OCR creado en GCP |
| `GOOGLE_CREDENTIALS_JSON` | `ocr.service.js` | JSON completo de la cuenta de servicio (solo producción) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `ocr.service.js` | Ruta al archivo de credenciales (solo desarrollo local) |
| `SUPABASE_URL` | `supabase.service.js` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | `supabase.service.js` | service_role key — permite escribir omitiendo RLS |
| `ADMIN_TOKEN` | `admin.controller.js` | Token para el panel de administración |
| `NODE_ENV` | `app.js` | Controla si se activa CORS y si se sirve el frontend estático |
| `PORT` | `server.js` | Puerto del servidor (Railway lo inyecta automáticamente) |

---

## Preguntas frecuentes en sustentación

**¿Dónde se almacena el documento que sube el usuario?**
En ningún lugar. Vive únicamente en la RAM del servidor durante los segundos que tarda el procesamiento (OCR + Gemini). En cuanto el controlador termina de ejecutarse, el Garbage Collector de Node.js libera ese buffer. No hay escritura en disco, no hay subida a ningún bucket de almacenamiento.

**¿Supabase no rompe el principio Zero Storage?**
No. Supabase almacena únicamente **metadatos de sesión**: tipo de documento, tiempo de procesamiento en milisegundos, si el usuario confirmó el análisis, calificación de estrellas y tiempo ahorrado declarado. El contenido del documento (texto extraído por OCR, análisis de Gemini) nunca se guarda en Supabase ni en ningún otro sistema persistente.

**¿Cómo se comunica el frontend con el backend?**
A través de HTTP. `documento.service.js` en el frontend construye un `FormData` con el archivo y hace `fetch()` a `POST /api/documentos/analizar`. El backend responde con un JSON. Todo ocurre en el mismo servidor en producción.

**¿Qué pasa si el PDF tiene 30 páginas?**
`ocr.service.js` lo detecta con `pdf-lib`, lo divide en trozos de máximo 14 páginas (el límite de Document AI), procesa cada trozo por separado y concatena el texto resultante. Todo en memoria, sin escritura en disco.

**¿Por qué Gemini a veces incluye bloques de código en su respuesta?**
Gemini está entrenado para ser conversacional y a veces envuelve el JSON en un bloque de código markdown. La función `limpiarJSON()` en `gemini.service.js` elimina esas marcas (` ```json ``` `) antes de hacer `JSON.parse()`.

**¿Qué diferencia hay entre `/analizar` y `/confirmar`?**
`/analizar` procesa el documento y devuelve el análisis de la IA para que el usuario lo revise. También inserta un registro en Supabase con `confirmado=false`. `/confirmar` solo se llama si el usuario aprueba explícitamente el resultado, y actualiza ese registro a `confirmado=true`. Esta separación implementa el principio Human-in-the-Loop: la IA propone, el humano decide.

**¿Cómo sabe el frontend si está en desarrollo o producción?**
Por la variable de entorno de Vite `VITE_API_URL`. En desarrollo apunta a `http://localhost:3001/api`. En producción no existe y el código usa la ruta relativa `/api`, que va al mismo servidor donde está desplegado.

---
description: "Usa cuando: escribas o revises archivos del backend de Express (rutas, controladores, servicios, middlewares). Cubre: recepción de archivos en memoria con multer (sin persistencia de documentos), validación de archivos en entrada, manejo de errores asíncronos, estructura modular de carpetas y convenciones de nombrado."
applyTo: ["backend/**", "server/**", "src/backend/**", "src/server/**"]
---

# Reglas del Backend — DocPilot

## Estructura de Carpetas Obligatoria

```
backend/
├── routes/        # Solo definición de rutas, sin lógica de negocio
├── controllers/   # Orquestación: recibe req/res, llama a servicios
├── services/      # Lógica de negocio pura (OCR, Gemini, etc.)
├── middlewares/   # Validaciones, manejo de errores global
└── app.js         # Configuración central de Express
```

## Recepción de Archivos — Sin persistencia de documentos (Obligatorio)

Los documentos no se guardan en disco ni en base de datos propia. Ojo: eso **no** significa que ningún tercero los reciba; Google Document AI y Gemini procesan el contenido (ver `docs/DATOS_Y_PRIVACIDAD.md`).

- Usar **siempre** `multer.memoryStorage()`. Jamás `dest` ni `diskStorage`.
- El buffer (`req.file.buffer`) se pasa directamente al servicio OCR y se descarta tras su uso.
- Nunca almacenar el buffer en una variable global ni en ninguna estructura persistente.

```js
// CORRECTO
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// PROHIBIDO
const upload = multer({ dest: 'uploads/' });
```

## Validación de Archivos en Entrada

Toda ruta que reciba archivos debe validar antes de procesar:

- **Tipos permitidos:** `application/pdf`, `image/png`, `image/jpeg`, `image/tiff`.
- **Tamaño máximo:** 10 MB (`limits: { fileSize: 10 * 1024 * 1024 }`).
- **Contenido real:** el MIME declarado no basta. `services/validacionArchivo.service.js` comprueba extensión, firma (magic bytes) y estructura del archivo; `middlewares/validarArchivo.js` ya lo invoca.
- Rechazar con `400 Bad Request` si el archivo no cumple, con mensaje descriptivo en español.

```js
// Ejemplo de fileFilter para multer
fileFilter: (req, file, cb) => {
  const tiposPermitidos = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];
  if (!tiposPermitidos.includes(file.mimetype)) {
    // Rechazar el archivo con un error claro
    return cb(new Error('Tipo de archivo no permitido. Solo PDF, PNG, JPEG o TIFF.'), false);
  }
  cb(null, true);
}
```

## Manejo de Errores Asíncronos

- Todos los controladores usan `async/await` dentro de `try/catch`.
- El bloque `catch` llama a `next(error)` para delegarlo al middleware de errores global.
- Nunca enviar respuestas de error directamente desde el controlador; usar el middleware centralizado.

```js
// CORRECTO
const miControlador = async (req, res, next) => {
  try {
    const resultado = await miServicio.procesar(req.file.buffer);
    res.status(200).json({ datos: resultado });
  } catch (error) {
    next(error); // Delegar al middleware de errores global
  }
};
```

## Middleware de Errores Global

Siempre definir en `app.js` como último middleware:

```js
// Middleware de errores — debe tener los 4 parámetros (err, req, res, next)
app.use((err, req, res, next) => {
  const estado = err.status || 500;
  res.status(estado).json({ error: err.message || 'Error interno del servidor' });
});
```

## Convenciones de Nombrado

| Artefacto | Convención | Ejemplo |
|-----------|-----------|---------|
| Archivos de ruta | `<recurso>.routes.js` | `documento.routes.js` |
| Archivos de controlador | `<recurso>.controller.js` | `documento.controller.js` |
| Archivos de servicio | `<recurso>.service.js` | `ocr.service.js` |
| Variables/funciones | `camelCase` | `procesarDocumento` |

## Human-in-the-Loop — Endpoints

- Los endpoints de análisis (`/analizar`, `/clasificar`) devuelven el resultado de la IA como JSON hacia el frontend. **No ejecutan ninguna acción final** (enviar correo, modificar datos) por sí solos.
- Las acciones finales tienen su propio endpoint de confirmación (ej. `POST /confirmar-respuesta`) que el frontend llama explícitamente tras la revisión del usuario.

## Comentarios en Código

- Todos los bloques de lógica deben tener comentarios en **español** explicando el *por qué*.
- Mínimo un comentario por función/middleware describiendo su propósito.

# Datos y privacidad

Este documento describe, a partir del código de este repositorio, **qué datos procesa DocPilot, adónde viajan, qué se conserva y qué no**. Está pensado para que cualquier persona que despliegue o use la aplicación entienda sus límites reales de privacidad.

> **No es asesoría legal.** Describe el comportamiento técnico. Si despliegas DocPilot con datos de terceros, valida las obligaciones que te apliquen (por ejemplo, la Ley 1581 de 2012 en Colombia) con un profesional.

## Terminología: por qué ya no se dice «Zero Storage»

Las versiones anteriores presentaban la aplicación como de «Zero Storage» (almacenamiento cero). Ese término es **inexacto** para esta arquitectura:

- Supabase **sí conserva** metadatos de uso (y comentarios de texto libre).
- Los documentos **sí se transmiten** y procesan en servicios de Google que DocPilot no controla.
- Los logs del servidor y de la plataforma de despliegue **sí conservan** información operativa.

El término correcto, y el que usa el proyecto, es **«sin persistencia de documentos en DocPilot»**: el archivo y su texto extraído no se escriben en disco ni en la base de datos de la aplicación.

## Resumen

| Dato | ¿Se procesa en memoria de DocPilot? | ¿Se envía a terceros? | ¿Se conserva en DocPilot? |
|------|:---:|:---:|:---:|
| Archivo original (PDF/imagen) | Sí (Buffer en RAM) | Sí → Google Document AI | **No** |
| Texto extraído por OCR | Sí | Sí → Google Gemini | **No** |
| Análisis generado por la IA | Sí | — (lo genera Gemini) | **No** (se devuelve al navegador) |
| Tipo de documento, tiempo, confirmación | Sí | No | **Sí** → Supabase |
| Valoración y comentario de la encuesta | Sí | No | **Sí** → Supabase |
| Correo, nombre u otros datos de contacto | No se solicitan | No | **No** |
| Línea de log de aceptación del aviso | Sí | No | **Sí** → logs del servidor |

## 1. Qué se procesa temporalmente en memoria

Todo ocurre dentro de una única petición `POST /api/documentos/analizar`:

1. **Recepción.** `multer.memoryStorage()` deja el archivo en un `Buffer` en RAM (máximo 10 MB). No se usa `dest` ni `diskStorage` y el código de backend no escribe archivos (no hay `fs.write*`).
2. **Validación.** Se inspecciona el buffer (firma, extensión, estructura). Para PDF se carga con `pdf-lib`.
3. **División de PDF.** Si supera 14 páginas, `pdf-lib` crea en memoria varios PDF más pequeños.
4. **Codificación.** Cada trozo se convierte a base64 para enviarlo a Document AI.
5. **Texto y análisis.** El texto extraído y el JSON de la IA son cadenas en memoria.

Al terminar la petición no quedan referencias al buffer ni al texto, y el recolector de basura de Node.js libera esa memoria. DocPilot **no sobrescribe explícitamente** la memoria ni controla el *swap* o los volcados del sistema operativo del servidor donde lo despliegues.

En el navegador, la vista previa del documento usa una URL de objeto local (`URL.createObjectURL`) que se revoca al cerrar la vista; el archivo no se sube para previsualizarlo.

## 2. Qué se guarda en Supabase

Tabla `registros_uso` (esquema en [supabase-schema.sql](supabase-schema.sql)):

| Columna | Contenido | Origen |
|---------|-----------|--------|
| `id` | UUID del registro | Base de datos |
| `fecha_hora` | Momento del análisis | Base de datos |
| `tipo_documento` | Etiqueta de tipo, p. ej. «Factura de venta» | **Generada por Gemini** |
| `tiempo_ms` | Duración del procesamiento | Servidor |
| `confirmado` | Si el usuario confirmó el análisis | Usuario |
| `estrellas`, `tiempo_ahorrado` | Valoración (opcional) | Usuario |
| `comentario` | Texto libre de hasta 200 caracteres (opcional); puede empezar con un código de documento entre corchetes | Usuario |

Puntos a tener en cuenta:

- `tipo_documento` lo redacta la IA a partir del contenido. Normalmente es genérico («Contrato — arrendamiento»), pero **no se garantiza** que nunca incluya algún detalle del documento.
- `comentario` es **texto libre**: si el usuario escribe datos personales allí, se guardarán. El aviso de la aplicación lo advierte.
- No hay caducidad automática. El administrador puede borrar registros desde el panel (`DELETE /api/admin/registros[/:id]`) o directamente en Supabase.
- Esta versión **no solicita ni guarda el correo** de las personas usuarias. Si una tabla heredada conserva la columna `correo_usuario`, la aplicación no la escribe.
- Supabase es un proveedor externo: los datos que guarda residen en su infraestructura y bajo sus condiciones.

## 3. Qué se envía a Google Cloud Document AI

- **Qué:** el contenido completo del archivo (en base64) y su tipo MIME. Para PDF de más de 14 páginas, cada trozo por separado.
- **Cómo:** HTTPS, con una cuenta de servicio de tu proyecto de Google Cloud.
- **Retención y uso:** los define Google según los términos de Document AI y la configuración de tu proyecto. **DocPilot no los controla y este repositorio no los verifica.** Consulta la documentación de privacidad de Cloud Document AI antes de procesar información sensible.

## 4. Qué se transmite a Gemini

- **Fase de clasificación:** un fragmento del texto extraído (aprox. los primeros 2 500 caracteres y 1 500 del centro del documento) más las instrucciones.
- **Fase de análisis:** el **texto completo** extraído, la fecha actual del servidor y las instrucciones del prompt especializado.
- **Cómo:** API de Gemini (`gemini-2.5-flash`, temperatura 0) con tu API key.
- **Retención y uso:** los define Google en los términos de la Gemini API. Esos términos pueden diferenciar el servicio gratuito del de pago, por ejemplo en si el contenido puede usarse para mejorar productos de Google. **Revisa los términos vigentes** y usa el nivel adecuado si procesas documentos de terceros.

## 5. Datos en logs y en el navegador

- **Logs de la aplicación** (salida estándar del servidor):
  - Una línea `[VISITA] <fecha ISO> | Consentimiento ... ACEPTADO` cuando alguien acepta el aviso, y una línea `[HITL] ... confirmó un análisis` cuando se confirma uno. Ninguna incluye datos personales ni datos enviados por el cliente, y las fechas las genera el servidor.
  - Los errores 5xx se registran con su mensaje y su causa técnica (por ejemplo, el texto de error de Document AI o de Supabase), con los caracteres de control sustituidos. **No se registra el contenido de los documentos.**
- **Logs de la plataforma de despliegue** (p. ej. Railway): pueden incluir metadatos de acceso como direcciones IP y rutas. Su retención depende de la plataforma, no de DocPilot.
- **Navegador:**
  - `localStorage['docpilot_consentimiento_v1']`: bandera booleana de que se aceptó el aviso.
  - `sessionStorage['docpilot_admin_token']`: token del administrador mientras la pestaña esté abierta.

## 6. Qué no se conserva

- El archivo original y los trozos de PDF.
- El texto extraído por OCR.
- El análisis completo de la IA (se entrega al navegador y no se persiste).
- Datos de contacto de las personas usuarias.

## 7. Limitaciones reales de privacidad

1. **Terceros.** Google (Document AI y Gemini) y Supabase reciben datos. Su tratamiento queda fuera del control de DocPilot.
2. **Texto libre.** Los comentarios de la encuesta y, en menor medida, la etiqueta `tipo_documento` pueden contener información proveniente del usuario o del documento.
3. **Logs externos.** La plataforma de despliegue puede conservar registros técnicos más allá de lo que escribe la aplicación.
4. **Sin cifrado propio ni controles de acceso por usuario.** El transporte usa HTTPS si se despliega detrás de TLS; la aplicación no cifra datos en reposo por sí misma (lo hace el proveedor de la base de datos) y no hay cuentas de usuario.
5. **Endpoints públicos.** Quien conozca la URL puede enviar documentos para analizar; no hay autenticación ni límite de peticiones en los endpoints de análisis.
6. **Memoria del servidor.** El borrado es el del recolector de basura, no un borrado seguro.
7. **Panel admin.** Un único token compartido protege el acceso a las métricas y a las operaciones de borrado.

## 8. Recomendaciones si lo despliegas con datos reales

- Usa el nivel de pago de la API de Gemini y revisa los acuerdos de tratamiento de datos de Google Cloud y Supabase.
- Define una política de retención y de borrado para `registros_uso` y para los logs de la plataforma.
- Añade autenticación y *rate limiting* a los endpoints de análisis.
- Mantén activado RLS en Supabase (el esquema lo hace) y protege `SUPABASE_SERVICE_KEY` y `ADMIN_TOKEN`.
- Rota periódicamente las credenciales y no las compartas en repositorios ni capturas.
- Informa a las personas usuarias, antes de cargar documentos, de que el contenido se envía a Google para su procesamiento (el aviso de la aplicación ya lo hace).

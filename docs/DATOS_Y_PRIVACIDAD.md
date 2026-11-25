# Datos y privacidad

DocPilot procesa el archivo y el texto extraído en memoria y los transmite a servicios de Google para su procesamiento. Supabase conserva los metadatos de uso y la valoración opcional. Esta página describe el comportamiento del código y los límites de privacidad del flujo.

## Resumen

| Dato | Destino | Persistencia gestionada por DocPilot |
| --- | --- | --- |
| Archivo original (PDF o imagen) | Google Document AI | En memoria durante la petición. |
| Texto extraído por OCR | Google Gemini | En memoria durante la petición. |
| Análisis generado por Gemini | Navegador | En memoria hasta reiniciar el flujo o salir de la página. |
| Categoría, tiempo y confirmación | Supabase | Fila de metadatos en `registros_uso`. |
| Valoración y comentario de encuesta | Supabase | Campos opcionales de la misma fila. |
| Aceptación del aviso | Logs y navegador | Fecha generada por el servidor y bandera local. |

## 1. Qué se procesa temporalmente en memoria

Todo ocurre dentro de una única petición `POST /api/documentos/analizar`:

1. **Recepción.** `multer.memoryStorage()` deja el archivo en un `Buffer` en RAM (máximo 10 MiB).
2. **Validación.** Se inspecciona el buffer (firma, extensión, estructura). Para PDF se carga con `pdf-lib`.
3. **División de PDF.** Si supera 14 páginas, `pdf-lib` crea en memoria varios PDF más pequeños.
4. **Codificación.** Cada trozo se convierte a base64 para enviarlo a Document AI.
5. **Texto y análisis.** El texto extraído y el JSON de la IA son cadenas en memoria.

La liberación de memoria queda a cargo del recolector de basura de Node.js. El sistema operativo controla el *swap* y los volcados de memoria.

En el navegador, la vista previa del documento usa una URL de objeto local (`URL.createObjectURL`) que se revoca al cerrar la vista; el archivo no se sube para previsualizarlo.

## 2. Qué se guarda en Supabase

Tabla `registros_uso` (esquema en [supabase-schema.sql](supabase-schema.sql)):

| Columna | Contenido | Origen |
|---------|-----------|--------|
| `id` | UUID del registro | Base de datos |
| `fecha_hora` | Momento del análisis | Base de datos |
| `tipo_documento` | Categoría de una lista cerrada, p. ej. `factura` | Clasificación de Gemini validada por el servidor |
| `tiempo_ms` | Duración del procesamiento | Servidor |
| `confirmado` | Si el usuario confirmó el análisis | Usuario |
| `estrellas`, `tiempo_ahorrado` | Valoración (opcional) | Usuario |
| `comentario` | Texto libre de hasta 200 caracteres (opcional); puede empezar con un código de documento entre corchetes | Usuario |

Puntos a tener en cuenta:

- Los registros antiguos pueden conservar la etiqueta libre generada por Gemini. Los registros nuevos guardan únicamente la categoría validada.
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
- **Cómo.** API de Gemini con la clave del servidor. El modelo predeterminado es `gemini-3.5-flash-lite` y se puede cambiar mediante `GEMINI_MODEL`. DocPilot admite hasta 400 000 unidades de código UTF-16 de texto extraído por análisis.
- **Retención y uso:** los define Google en los términos de la Gemini API. Esos términos pueden diferenciar el servicio gratuito del de pago, por ejemplo en si el contenido puede usarse para mejorar productos de Google. **Revisa los términos vigentes** y usa el nivel adecuado si procesas documentos de terceros.

## 5. Datos en logs y en el navegador

- **Logs de la aplicación** (salida estándar del servidor):
  - Una línea `[VISITA] <fecha ISO> | Consentimiento ... ACEPTADO` cuando alguien acepta el aviso. El servidor genera la fecha.
  - Los errores 5xx registran solo el estado HTTP y un código interno. Se excluyen mensajes de proveedores, fragmentos de documentos, credenciales y cuerpos de solicitudes.
- **Logs de infraestructura.** Si el servidor se ejecuta detrás de un proxy, este puede conservar metadatos de acceso, como IP y ruta, según su propia política.
- **Navegador:**
  - `localStorage['docpilot_consentimiento_v1']`: bandera booleana de que se aceptó el aviso.
  - `sessionStorage['docpilot_admin_token']`: token del administrador mientras la pestaña esté abierta.
  - El permiso de confirmación y encuesta vive en memoria en el navegador. Vence en una hora o al reiniciar el backend. La confirmación envía el permiso y el identificador, sin reenviar el análisis.

## 6. Qué no se conserva

- El archivo original y los trozos de PDF.
- El texto extraído por OCR.
- El análisis completo de la IA (se entrega al navegador y no se persiste).
- Datos de contacto de las personas usuarias.

## 7. Limitaciones reales de privacidad

1. **Terceros.** Google (Document AI y Gemini) y Supabase reciben datos. Su tratamiento queda fuera del control de DocPilot.
2. **Texto libre.** Los comentarios de la encuesta y las etiquetas de registros antiguos pueden contener información proveniente del usuario o del documento.
3. **Logs externos.** La plataforma de despliegue puede conservar registros técnicos más allá de lo que escribe la aplicación.
4. **Sin cifrado propio ni controles de acceso por usuario.** El transporte usa HTTPS si se despliega detrás de TLS; la aplicación no cifra datos en reposo por sí misma (lo hace el proveedor de la base de datos) y no hay cuentas de usuario.
5. **Acceso local.** El servidor escucha en loopback por defecto y limita la tasa y concurrencia del análisis por proceso. Configurar una dirección accesible por red permite que otros clientes alcancen ese punto de entrada.
6. **Memoria del servidor.** El borrado es el del recolector de basura, no un borrado seguro.
7. **Panel admin.** Un único token compartido protege el acceso a las métricas y a las operaciones de borrado.

## 8. Recomendaciones si lo despliegas con datos reales

- Usa el nivel de pago de la API de Gemini y revisa los acuerdos de tratamiento de datos de Google Cloud y Supabase.
- Define una política de retención y de borrado para `registros_uso` y para los logs de la plataforma.
- Si habilitas acceso por red, restringe los clientes que puedan alcanzar el servidor. Los límites del proceso acotan el consumo, pero no identifican personas.
- Mantén activado RLS en Supabase (el esquema lo hace) y protege `SUPABASE_SERVICE_KEY` y `ADMIN_TOKEN`.
- Rota periódicamente las credenciales y no las compartas en repositorios ni capturas.
- Informa a las personas usuarias, antes de cargar documentos, de que el contenido se envía a Google para su procesamiento (el aviso de la aplicación ya lo hace).

# Contexto y Reglas del Proyecto (Agente Copilot)

**Rol del Agente:** Eres el asistente de desarrollo del proyecto **DocPilot**: una aplicación web con OCR e IA generativa para analizar documentos con revisión humana (Human-in-the-Loop).

Tu objetivo es asistir en la escritura de código, manteniendo estricto apego a la arquitectura, las reglas del negocio y el stack tecnológico definido.

## 🛠 Stack Tecnológico Estricto
- **Frontend:** React (Exclusivamente componentes funcionales y Hooks. Nada de clases).
- **Backend:** Node.js con Express.
- **Servicios Cloud:** Google Cloud Document AI (exclusivamente para OCR) y Google Gemini API (para análisis, clasificación y sugerencias de respuestas).
- **Base de datos:** Supabase — **solo** para metadatos de sesión (tipo de documento, tiempo de procesamiento, confirmación y valoración del usuario). Nunca para almacenar documentos o texto extraído.
- **Pruebas:** Jest + Supertest en `backend/tests`, con servicios externos simulados (`npm test`).

## 🛑 Principios Innegociables de Arquitectura (REGLAS DE ORO)

1. **Sin persistencia de documentos:**
   - Está ESTRICTAMENTE PROHIBIDO generar código que guarde archivos físicos en el servidor o en la nube.
   - Todo archivo procesado viaja desde el cliente al backend, se extrae el texto en memoria (RAM) mediante OCR usando buffers, y el buffer se descarta al terminar la petición.
   - NUNCA uses `fs.writeFileSync`, `fs.writeFile`, ni configures `multer` con `dest` o `diskStorage`. Usa siempre `multer.memoryStorage()`.
   - NUNCA sugieras integraciones con AWS S3, Google Cloud Storage o bases de datos para almacenar el PDF o la imagen física.
   - Los servicios externos (Document AI y Gemini) reciben el contenido para procesarlo; esa limitación debe estar documentada, no ocultarse.

2. **Human-in-the-Loop (HITL):**
   - El sistema NO es autónomo. El backend siempre debe devolver la información estructurada y la recomendación de la IA hacia el frontend (React).
   - NUNCA crees endpoints que envíen correos o ejecuten respuestas automáticas hacia clientes finales sin que haya un paso previo donde el usuario confirme la acción en la interfaz.

3. **Errores honestos:**
   - Una operación que falló (guardado en Supabase, OCR, IA) nunca debe responder como exitosa. Usa `ErrorApp` (`backend/utils/errores.js`) con un estado HTTP y un código estable.

## 💻 Convenciones de Código y Buenas Prácticas

- **Código listo para producción:** Todo el código debe ser modular y limpio.
- **Comentarios:** El código debe estar comentado en español explicando el "por qué" de la lógica, no solo el "qué".
- **Manejo de Errores:** Todos los controladores y llamadas asíncronas deben estar envueltos en bloques `try/catch` y propagar con `next(error)`. Nunca dejes promesas sin manejar.
- **Pruebas:** Todo cambio en servicios, controladores o middlewares debe mantener `npm test` en verde y añadir pruebas cuando cambie el comportamiento.

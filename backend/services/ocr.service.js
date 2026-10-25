// Servicio de OCR usando Google Cloud Document AI.
// Responsabilidad única: recibir un buffer de archivo en memoria y devolver
// el texto extraído como string plano.
// El buffer NUNCA se escribe en disco — se envía directamente a la API de GCP
// codificado en base64 (sin escribir en disco) y se envía a Google Document AI.
//
// ESTRATEGIA DE PAGINACIÓN:
// Document AI limita a 15 páginas por petición en modo normal. Para documentos
// más largos, este servicio divide el PDF en trozos de LIMITE_PAGINAS páginas
// usando pdf-lib (todo en memoria, sin escritura en disco), procesa cada trozo
// por separado y concatena el texto resultante.

require('dotenv').config();

const https = require('https');
const { GoogleAuth } = require('google-auth-library');
const { PDFDocument } = require('pdf-lib');
const { ErrorApp } = require('../utils/errores');
const { MAX_PAGINAS_PDF } = require('./validacionArchivo.service');

// En producción (Railway), las credenciales de GCP vienen como variable de entorno
// GOOGLE_CREDENTIALS_JSON con el contenido completo del JSON de la cuenta de servicio.
// En desarrollo local, GoogleAuth las lee desde el archivo indicado en
// GOOGLE_APPLICATION_CREDENTIALS.
// Este bloque debe ejecutarse ANTES de crear el cliente GoogleAuth.
let credencialesGCP;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  try {
    credencialesGCP = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } catch (e) {
    throw new Error('GOOGLE_CREDENTIALS_JSON no es un JSON válido: ' + e.message);
  }
}

// Cliente de autenticación reutilizable — se crea una sola vez al iniciar el módulo.
// Si hay credenciales inyectadas como variable de entorno, se usan directamente.
// Si no, GoogleAuth busca GOOGLE_APPLICATION_CREDENTIALS (desarrollo local).
const auth = new GoogleAuth({
  credentials: credencialesGCP,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

// Construir el nombre completo del procesador usando las variables de entorno.
const NOMBRE_PROCESADOR = `projects/${process.env.DOCUMENT_AI_PROJECT_ID}/locations/${process.env.DOCUMENT_AI_LOCATION}/processors/${process.env.DOCUMENT_AI_PROCESSOR_ID}`;

// Límite de páginas por petición impuesto por Document AI en modo normal.
// Se usa 14 en lugar de 15 como margen de seguridad ante conteos internos de la API.
const LIMITE_PAGINAS = 14;

// Tiempo máximo de espera por cada llamada a Document AI (ms)
const TIMEOUT_OCR_MS = 60000;

/**
 * enviarChunkOCR — envía UN buffer (≤ LIMITE_PAGINAS páginas) a Document AI.
 * Función interna de uso exclusivo por extraerTexto.
 *
 * @param {Buffer} bufferChunk - Buffer del trozo de documento en memoria
 * @param {string} mimeType    - Tipo MIME ('application/pdf', 'image/png', etc.)
 * @param {string} token       - Token OAuth2 válido para autenticar con GCP
 * @returns {Promise<string>}  - Texto extraído del trozo
 */
const enviarChunkOCR = (bufferChunk, mimeType, token) => {
  // Codificar el buffer en base64 — formato requerido por la API REST de Document AI
  const contenidoBase64 = bufferChunk.toString('base64');

  // Construir el body JSON de la petición.
  // No se incluye fieldMask porque el procesador configurado en este proyecto
  // no soporta imageless mode independientemente del parámetro — la solución
  // real es dividir el PDF en trozos que respeten el límite de 15 páginas.
  const cuerpo = JSON.stringify({
    rawDocument: {
      content: contenidoBase64, // Contenido del trozo codificado en base64
      mimeType: mimeType,        // Tipo MIME para que el procesador identifique el formato
    },
  });

  const hostname = `${process.env.DOCUMENT_AI_LOCATION}-documentai.googleapis.com`;
  const rutaEndpoint = `/v1/${NOMBRE_PROCESADOR}:process`;

  // Retornar una Promise que resuelve con el texto extraído del trozo.
  // Se usa https nativo de Node.js para evitar transformaciones inesperadas
  // de librerías intermedias (gaxios, axios) sobre el body JSON.
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: rutaEndpoint,
        method: 'POST',
        timeout: TIMEOUT_OCR_MS, // evita que una petición colgada retenga la solicitud indefinidamente
        headers: {
          'Authorization': `Bearer ${token}`,          // Token OAuth2 de GCP
          'Content-Type': 'application/json',           // Body en formato JSON
          'Content-Length': Buffer.byteLength(cuerpo),  // Longitud exacta en bytes
        },
      },
      (res) => {
        let datos = '';
        res.on('data', (chunk) => { datos += chunk; });
        res.on('end', () => {
          try {
            const respuesta = JSON.parse(datos);
            // Si Document AI devuelve un error HTTP, se conserva el detalle solo en la causa
            // (para logs) y al usuario se le muestra un mensaje seguro.
            if (res.statusCode >= 400) {
              return reject(new ErrorApp('El servicio de OCR no pudo procesar el documento. Intenta de nuevo.', {
                status: 502,
                codigo: 'OCR_FALLIDO',
                causa: new Error(respuesta.error?.message || `Error HTTP ${res.statusCode} de Document AI`),
              }));
            }
            // Extraer el texto del documento procesado por Document AI
            resolve(respuesta.document?.text || '');
          } catch (errorParseo) {
            reject(new ErrorApp('El servicio de OCR devolvió una respuesta inválida. Intenta de nuevo.', {
              status: 502,
              codigo: 'OCR_RESPUESTA_INVALIDA',
              causa: errorParseo,
            }));
          }
        });
      }
    );

    // Errores de red (DNS, conexión rechazada, etc.)
    req.on('error', (errorRed) => reject(new ErrorApp('No se pudo conectar con el servicio de OCR. Intenta de nuevo.', {
      status: 502,
      codigo: 'OCR_NO_DISPONIBLE',
      causa: errorRed,
    })));
    // Inactividad del socket: destruir la petición dispara 'error' (OCR_NO_DISPONIBLE)
    req.on('timeout', () => req.destroy(new Error(`Document AI no respondió en ${TIMEOUT_OCR_MS} ms`)));
    req.write(cuerpo);       // Escribir el body JSON en la petición
    req.end();               // Finalizar y enviar la petición
  });
};

/**
 * dividirPDFEnTrozos — divide un PDF ya cargado en trozos de máximo maxPaginas páginas.
 * Opera completamente en memoria usando pdf-lib (sin escribir en disco).
 *
 * @param {PDFDocument} docFuente - Documento ya cargado (así no se vuelve a parsear el archivo)
 * @param {number} maxPaginas     - Máximo de páginas por trozo
 * @returns {Promise<Buffer[]>}   - Array de buffers, uno por trozo
 */
const dividirPDFEnTrozos = async (docFuente, maxPaginas) => {
  const totalPaginas = docFuente.getPageCount();
  const trozos = [];

  // Iterar en bloques de maxPaginas para crear cada trozo
  for (let inicio = 0; inicio < totalPaginas; inicio += maxPaginas) {
    const fin = Math.min(inicio + maxPaginas, totalPaginas);

    // Índices base-0 de las páginas que van en este trozo
    const indicesPaginas = Array.from({ length: fin - inicio }, (_, i) => inicio + i);

    // Crear un nuevo documento PDF vacío para este trozo
    const docTrozo = await PDFDocument.create();

    // Copiar las páginas del documento fuente al trozo (operación en memoria)
    const paginasCopiadas = await docTrozo.copyPages(docFuente, indicesPaginas);
    paginasCopiadas.forEach((pagina) => docTrozo.addPage(pagina));

    // Serializar el trozo a Buffer (sin escribir en disco)
    const bufferTrozo = Buffer.from(await docTrozo.save());
    trozos.push(bufferTrozo);
  }

  return trozos;
};

/**
 * extraerTexto — punto de entrada público del servicio.
 * Detecta si el PDF supera el límite de páginas y lo divide automáticamente.
 *
 * Flujo:
 * 1. Recibe buffer en RAM (de multer memoryStorage — nunca de disco)
 * 2. Si es PDF y supera LIMITE_PAGINAS → dividir con pdf-lib y procesar cada trozo
 * 3. Si es imagen o PDF pequeño → enviar directamente a Document AI
 * 4. Concatenar textos y retornar resultado completo
 *
 * @param {Buffer} buffer   - Contenido del archivo en memoria
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {Promise<string>} - Texto completo extraído del documento
 */
const extraerTexto = async (buffer, mimeType) => {
  // Verificar que las variables de entorno necesarias están configuradas
  if (!process.env.DOCUMENT_AI_PROJECT_ID || !process.env.DOCUMENT_AI_PROCESSOR_ID) {
    throw new Error('Las variables de Document AI no están configuradas en el archivo .env');
  }

  // Obtener el token OAuth2 una sola vez para todas las peticiones de esta llamada
  let token;
  try {
    token = await auth.getAccessToken();
  } catch (errorAuth) {
    throw new ErrorApp('No se pudo autenticar con el servicio de OCR. Intenta de nuevo más tarde.', {
      status: 502,
      codigo: 'OCR_AUTENTICACION_FALLIDA',
      causa: errorAuth,
    });
  }

  let textoFinal = '';

  if (mimeType === 'application/pdf') {
    // Para PDFs, verificar el número de páginas antes de enviar a Document AI.
    // Si el PDF no se puede interpretar se rechaza como documento inválido (422)
    // en lugar de dejar que falle como error interno del servidor.
    let docPDF;
    let totalPaginas;
    try {
      docPDF = await PDFDocument.load(buffer);
      totalPaginas = docPDF.getPageCount();
    } catch (errorPDF) {
      throw new ErrorApp('El PDF está dañado, protegido o no se puede leer.', {
        status: 422,
        codigo: 'PDF_ILEGIBLE',
        causa: errorPDF,
      });
    }

    // Segunda barrera (la primera es la validación de carga): cada 14 páginas es una llamada de pago
    if (totalPaginas > MAX_PAGINAS_PDF) {
      throw new ErrorApp(`El PDF tiene ${totalPaginas} páginas y el máximo permitido es ${MAX_PAGINAS_PDF}.`, {
        status: 422,
        codigo: 'PDF_DEMASIADO_EXTENSO',
      });
    }

    if (totalPaginas > LIMITE_PAGINAS) {
      // El PDF supera el límite — dividir en trozos y procesar cada uno
      // Cada trozo tiene como máximo LIMITE_PAGINAS páginas
      const trozos = await dividirPDFEnTrozos(docPDF, LIMITE_PAGINAS);

      // Procesar los trozos en secuencia para evitar sobrecargar la cuota de la API
      const textosPorTrozo = [];
      for (let i = 0; i < trozos.length; i++) {
        const textoParcial = await enviarChunkOCR(trozos[i], mimeType, token);
        textosPorTrozo.push(textoParcial);
      }

      // Unir el texto de todos los trozos con salto de línea entre cada uno
      textoFinal = textosPorTrozo.join('\n');

    } else {
      // PDF dentro del límite — enviar directamente sin dividir
      textoFinal = await enviarChunkOCR(buffer, mimeType, token);
    }

  } else {
    // Imágenes (PNG, JPEG, TIFF) — no tienen límite de páginas, enviar directamente
    textoFinal = await enviarChunkOCR(buffer, mimeType, token);
  }

  // Verificar que se extrajo contenido útil del documento
  if (!textoFinal.trim()) {
    throw new ErrorApp('No se pudo extraer texto del documento. Verifica que el archivo tenga contenido legible.', {
      status: 422,
      codigo: 'OCR_SIN_TEXTO',
    });
  }

  return textoFinal;
};

module.exports = { extraerTexto };


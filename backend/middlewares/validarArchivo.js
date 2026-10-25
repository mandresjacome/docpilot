// Middleware de validación y recepción de archivos.
// Combina multer (con memoryStorage obligatorio) y una validación en dos capas:
//   1. multer: tamaño máximo, un solo archivo, campo "documento" y MIME declarado.
//   2. validacionArchivo.service: contenido real (firma), extensión y estructura.
// Si el archivo no cumple, la cadena se corta aquí con un 400 antes del controlador.

const multer = require('multer');
const { ErrorApp } = require('../utils/errores');
const {
  validarContenidoArchivo,
  TIPOS_PERMITIDOS,
  TAMANO_MAXIMO,
} = require('../services/validacionArchivo.service');

// --- Configuración de multer ---
// Se usa memoryStorage para que el archivo quede en RAM como Buffer.
// NUNCA usar diskStorage ni el parámetro 'dest': los archivos no deben escribirse en disco.
const storage = multer.memoryStorage();

// fileFilter se ejecuta por multer antes de guardar el buffer.
// Es la primera barrera (MIME declarado); la verificación del contenido real
// se hace después, cuando el buffer ya está disponible.
const fileFilter = (req, file, cb) => {
  if (!TIPOS_PERMITIDOS[file.mimetype]) {
    return cb(new ErrorApp(
      `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan PDF, PNG, JPEG o TIFF.`,
      { status: 400, codigo: 'TIPO_NO_PERMITIDO' }
    ), false);
  }
  cb(null, true);
};

// Instancia de multer con las restricciones definidas
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: TAMANO_MAXIMO, files: 1 },
});

// Traduce los errores propios de multer (en inglés) a mensajes en español con código estable
const traducirErrorMulter = (err) => {
  if (err instanceof ErrorApp) return err;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ErrorApp('El archivo supera el tamaño máximo permitido de 10 MB.', {
        status: 400,
        codigo: 'ARCHIVO_DEMASIADO_GRANDE',
      });
    }
    // Campo con otro nombre o más de un archivo
    return new ErrorApp('Envía un único archivo en el campo "documento".', {
      status: 400,
      codigo: 'CAMPO_ARCHIVO_INVALIDO',
    });
  }

  // Cualquier otro fallo al leer el multipart (cuerpo mal formado o cortado)
  return new ErrorApp('No se pudo leer el archivo enviado. Verifica que la carga esté completa.', {
    status: 400,
    codigo: 'CARGA_INVALIDA',
    causa: err,
  });
};

// Middleware exportado que espera un campo llamado 'documento' en el FormData del cliente
const validarArchivo = (req, res, next) => {
  upload.single('documento')(req, res, async (err) => {
    if (err) return next(traducirErrorMulter(err));

    // Verificar que realmente se envió un archivo en la petición
    if (!req.file) {
      return next(new ErrorApp('No se recibió ningún archivo. El campo debe llamarse "documento".', {
        status: 400,
        codigo: 'ARCHIVO_REQUERIDO',
      }));
    }

    try {
      // Segunda capa: contenido real, extensión y estructura del archivo
      await validarContenidoArchivo(req.file);
    } catch (errorValidacion) {
      return next(errorValidacion);
    }

    // El archivo pasó todas las validaciones — continuar al controlador
    next();
  });
};

module.exports = { validarArchivo };

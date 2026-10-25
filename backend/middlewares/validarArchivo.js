// Middleware de validación y recepción de archivos.
// Combina multer (con memoryStorage obligatorio) y validación de tipo/tamaño
// antes de que la petición llegue al controlador.
// Si el archivo no cumple, la cadena se corta aquí con un 400.

const multer = require('multer');

// --- Configuración de multer ---
// Se usa memoryStorage para que el archivo quede en RAM como Buffer.
// NUNCA usar diskStorage ni el parámetro 'dest': eso violaría la regla Zero Storage.
const storage = multer.memoryStorage();

// Tipos MIME permitidos por la lógica del negocio
const TIPOS_PERMITIDOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];

// Tamaño máximo: 10 MB expresado en bytes
const TAMANO_MAXIMO = 10 * 1024 * 1024;

// fileFilter se ejecuta por multer antes de guardar el buffer.
// Rechaza el archivo si el tipo no está permitido, evitando procesar
// datos potencialmente maliciosos o inesperados.
const fileFilter = (req, file, cb) => {
  if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
    // Crear un error con código de estado para que el errorHandler lo use
    const error = new Error(
      `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan PDF, PNG, JPEG o TIFF.`
    );
    error.status = 400;
    return cb(error, false);
  }
  cb(null, true);
};

// Instancia de multer con las restricciones definidas
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: TAMANO_MAXIMO },
});

// Middleware exportado que espera un campo llamado 'documento' en el FormData del cliente
const validarArchivo = (req, res, next) => {
  upload.single('documento')(req, res, (err) => {
    if (err) {
      // multer lanza su propio error si se supera el límite de tamaño (MulterError)
      // Se normaliza a 400 para que el errorHandler responda correctamente
      err.status = err.status || 400;
      return next(err);
    }

    // Verificar que realmente se envió un archivo en la petición
    if (!req.file) {
      const error = new Error('No se recibió ningún archivo. El campo debe llamarse "documento".');
      error.status = 400;
      return next(error);
    }

    // El archivo pasó todas las validaciones — continuar al controlador
    next();
  });
};

module.exports = { validarArchivo };

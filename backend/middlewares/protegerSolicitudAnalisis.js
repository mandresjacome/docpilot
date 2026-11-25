const { HOST_LOCAL } = require('../config/entorno');
const { ORIGENES_PERMITIDOS } = require('../config/cors');
const { ErrorApp } = require('../utils/errores');

const hostsLocales = new Set([HOST_LOCAL, 'localhost', '[::1]', '::1']);

const origenPermitido = (req) => {
  const origen = req.get('origin');
  if (!origen || ORIGENES_PERMITIDOS.includes(origen)) return true;
  return origen === `http://${req.get('host')}` || origen === `https://${req.get('host')}`;
};

module.exports = (req, res, next) => {
  const hostEscucha = process.env.HOST?.toLowerCase() || HOST_LOCAL;
  const hostPermitido = !hostsLocales.has(hostEscucha) || hostsLocales.has(req.hostname?.toLowerCase());

  // La cabecera obliga a los navegadores a consultar CORS antes de una carga de otro origen.
  if (!hostPermitido || !origenPermitido(req) || req.get('x-docpilot-analysis') !== '1') {
    return next(new ErrorApp('La solicitud de análisis no está autorizada.', {
      status: 403,
      codigo: 'SOLICITUD_ANALISIS_NO_AUTORIZADA',
    }));
  }
  next();
};

const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const clave = randomBytes(32);
const DURACION_MS = 60 * 60_000;

const firmar = (registroId, vencimiento) =>
  createHmac('sha256', clave).update(`${registroId ?? ''}:${vencimiento}`).digest('base64url');

const crearPermisoAnalisis = (registroId) => {
  const vencimiento = Date.now() + DURACION_MS;
  return `${vencimiento}.${firmar(registroId, vencimiento)}`;
};

const permisoAnalisisValido = (registroId, permiso) => {
  if (typeof permiso !== 'string' || !/^\d{13}\.[\w-]{43}$/.test(permiso)) return false;
  const [vencimiento, firma] = permiso.split('.');
  if (Number(vencimiento) <= Date.now()) return false;
  return timingSafeEqual(Buffer.from(firma), Buffer.from(firmar(registroId, vencimiento)));
};

module.exports = { crearPermisoAnalisis, permisoAnalisisValido };

// Rutas del panel de administración.
// Todos los endpoints requieren el header 'x-admin-token' con el valor correcto.
// El middleware verificarToken se aplica a nivel de router para proteger
// automáticamente cualquier ruta que se agregue en el futuro.

const express = require('express');
const router  = express.Router();
const { verificarToken, obtenerDashboard, eliminarRegistroAdmin, limpiarRegistrosAdmin } = require('../controllers/admin.controller');

// Aplicar la verificación de token a TODAS las rutas de este router
router.use(verificarToken);

// GET /api/admin/dashboard
// Devuelve métricas agregadas y actividad reciente para el panel de administración
router.get('/dashboard', obtenerDashboard);

// DELETE /api/admin/registros/:id
// Elimina un registro individual por su UUID
router.delete('/registros/:id', eliminarRegistroAdmin);

// DELETE /api/admin/registros
// Elimina todos los registros (limpiar base de pruebas)
router.delete('/registros', limpiarRegistrosAdmin);

module.exports = router;

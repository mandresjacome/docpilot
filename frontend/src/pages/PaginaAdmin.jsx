// Página del panel de administración — exclusiva para la docente/investigadora.
// Acceso protegido: el usuario debe ingresar el token de administrador para ver los datos.
// El token se guarda en sessionStorage (no localStorage) para que expire al cerrar el tab,
// evitando que quede activo indefinidamente en el navegador de un tercero.
//
// Muestra:
//   - Métricas agregadas: total procesado, confirmados, promedio estrellas, tiempo ahorrado
//   - Distribución por tipo de documento
//   - Tabla de actividad reciente (últimos 10 registros)

import React, { useState, useCallback, useEffect } from 'react';
import adminService from '../services/admin.service';

// Clave para sessionStorage — expira al cerrar la pestaña
const CLAVE_TOKEN_SESION = 'docpilot_admin_token';

// Mapeo de claves internas de tiempo_ahorrado a etiquetas legibles
const ETIQUETAS_TIEMPO = {
  menos_5min: 'Menos de 5 min',
  '5_15min':  '5 – 15 min',
  '15_30min': '15 – 30 min',
  mas_30min:  'Más de 30 min',
};

// Convierte milisegundos a segundos con 1 decimal para mostrar en el dashboard
const msASegundos = (ms) => ms ? `${(ms / 1000).toFixed(1)}s` : '—';

// Formatea una fecha ISO a formato legible en español colombiano
const formatearFecha = (isoString) => {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const PaginaAdmin = () => {
  // Token ingresado en el formulario de acceso
  const [tokenInput, setTokenInput] = useState('');

  // Token autenticado — si existe, se muestra el dashboard directamente
  // Se inicializa desde sessionStorage para persistir dentro de la misma sesión
  const [tokenAutenticado, setTokenAutenticado] = useState(
    () => sessionStorage.getItem(CLAVE_TOKEN_SESION) || null
  );

  // Datos del dashboard: { metricas, actividadReciente }
  const [dashboard, setDashboard] = useState(null);

  // Estado de carga y error para feedback al usuario
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  // ID del registro que se está eliminando — muestra spinner en esa fila
  const [eliminandoId, setEliminandoId] = useState(null);

  // Controla si se muestra el paso de confirmación del botón "Limpiar todo"
  const [confirmandoLimpiar, setConfirmandoLimpiar] = useState(false);

  /**
   * cargarDashboard — llama al servicio admin y actualiza el estado.
   * Se extrae como función reutilizable para poder refrescar los datos.
   */
  const cargarDashboard = useCallback(async (token) => {
    setCargando(true);
    setError(null);
    try {
      const datos = await adminService.obtenerDashboard(token);
      setDashboard(datos);
    } catch (err) {
      setError(err.message);
      // Si el token es inválido, limpiar la sesión para volver al formulario
      if (err.message.includes('incorrecto')) {
        sessionStorage.removeItem(CLAVE_TOKEN_SESION);
        setTokenAutenticado(null);
      }
    } finally {
      setCargando(false);
    }
  }, []);

  /**
   * manejarAcceso — guarda el token y actualiza el estado.
   * El useEffect se encarga de llamar cargarDashboard cuando tokenAutenticado cambia.
   */
  const manejarAcceso = (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    // Guardar el token en sessionStorage para persistir dentro de la misma pestaña
    sessionStorage.setItem(CLAVE_TOKEN_SESION, tokenInput.trim());
    // Esto dispara el useEffect que llama a cargarDashboard
    setTokenAutenticado(tokenInput.trim());
  };

  /**
   * Cargar el dashboard automáticamente cuando tokenAutenticado cambia.
   * Se usa useEffect para evitar llamadas durante el render (anti-patrón React).
   */
  useEffect(() => {
    if (tokenAutenticado) {
      cargarDashboard(tokenAutenticado);
    }
  }, [tokenAutenticado, cargarDashboard]);

  /**
   * manejarCerrarSesion — limpia el token y vuelve al formulario de acceso.
   */
  const manejarCerrarSesion = () => {
    sessionStorage.removeItem(CLAVE_TOKEN_SESION);
    setTokenAutenticado(null);
    setDashboard(null);
    setTokenInput('');
    setError(null);
    setConfirmandoLimpiar(false);
  };

  /**
   * manejarEliminarRegistro — elimina un registro individual y recarga el dashboard.
   */
  const manejarEliminarRegistro = async (id) => {
    setEliminandoId(id);
    try {
      await adminService.eliminarRegistro(tokenAutenticado, id);
      // Recargar el dashboard para reflejar la eliminación
      await cargarDashboard(tokenAutenticado);
    } catch (err) {
      setError(`Error al eliminar: ${err.message}`);
    } finally {
      setEliminandoId(null);
    }
  };

  /**
   * manejarLimpiarTodo — elimina todos los registros tras confirmación explícita.
   * Requiere dos clics (botón + confirmar) para evitar borrados accidentales.
   */
  const manejarLimpiarTodo = async () => {
    try {
      setCargando(true);
      await adminService.limpiarRegistros(tokenAutenticado);
      setConfirmandoLimpiar(false);
      await cargarDashboard(tokenAutenticado);
    } catch (err) {
      setError(`Error al limpiar: ${err.message}`);
      setConfirmandoLimpiar(false);
    } finally {
      setCargando(false);
    }
  };

  // ── Si no hay token autenticado, mostrar formulario de acceso ──────────────
  if (!tokenAutenticado) {
    return (
      <main className="admin-acceso">
        <div className="card admin-acceso-card">
          <h1>Panel de Administración</h1>
          <p className="subtitulo-pagina">
            Acceso exclusivo para el equipo de DocPilot.
          </p>
          <form onSubmit={manejarAcceso} className="admin-form">
            <label htmlFor="admin-token" className="admin-label">
              Token de acceso
            </label>
            <input
              id="admin-token"
              type="password"
              className="admin-input"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Ingresa el token de administrador"
              autoComplete="off"
              required
            />
            {error && <p className="error-admin" role="alert">{error}</p>}
            <button type="submit" className="btn-primario" disabled={cargando}>
              {cargando ? 'Verificando...' : 'Acceder'}
            </button>
          </form>
        </div>
      </main>
    );
  }


  // ── Estado de carga del dashboard ──────────────────────────────────────────
  if (cargando) {
    return (
      <main className="admin-dashboard">
        <p className="cargando-texto">Cargando estadísticas...</p>
      </main>
    );
  }

  // ── Error al cargar el dashboard ───────────────────────────────────────────
  if (error) {
    return (
      <main className="admin-dashboard">
        <div className="card">
          <p className="error-admin" role="alert">{error}</p>
          <button className="btn-secundario" onClick={manejarCerrarSesion}>
            Volver al acceso
          </button>
        </div>
      </main>
    );
  }

  // ── Dashboard principal ────────────────────────────────────────────────────
  if (!dashboard) return null;

  const { metricas, actividadReciente } = dashboard;

  return (
    <main className="admin-dashboard">

      {/* ── Encabezado con botón de cierre de sesión ── */}
      <div className="admin-header">
        <h1>Panel de Administración</h1>
        <button className="btn-secundario btn-pequeno" onClick={manejarCerrarSesion}>
          Cerrar sesión
        </button>
      </div>

      {/* ── Tarjetas de métricas principales ── */}
      <div className="metricas-grid">
        <div className="metrica-card">
          <span className="metrica-numero">{metricas.totalProcesados}</span>
          <span className="metrica-label">Documentos analizados</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-numero">{metricas.totalConfirmados}</span>
          <span className="metrica-label">Confirmados (HITL)</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-numero">
            {metricas.promedioEstrellas ? `${metricas.promedioEstrellas} ★` : '—'}
          </span>
          <span className="metrica-label">Calificación promedio</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-numero">{metricas.totalEncuestados}</span>
          <span className="metrica-label">Usuarios encuestados</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-numero">{msASegundos(metricas.promedioTiempoMs)}</span>
          <span className="metrica-label">Tiempo prom. de análisis</span>
        </div>
      </div>

      {/* ── Distribución por tipo de documento ── */}
      {Object.keys(metricas.porTipo).length > 0 && (
        <div className="card admin-seccion">
          <h2>Distribución por tipo de documento</h2>
          <div className="distribucion-tipos">
            {Object.entries(metricas.porTipo)
              .sort(([, a], [, b]) => b - a) // Ordenar de mayor a menor
              .map(([tipo, cantidad]) => (
                <div key={tipo} className="tipo-barra-fila">
                  <span className="tipo-nombre">{tipo}</span>
                  <div className="barra-contenedor">
                    <div
                      className="barra-relleno"
                      style={{
                        width: `${Math.round((cantidad / metricas.totalProcesados) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="tipo-cantidad">{cantidad}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Distribución de tiempo ahorrado ── */}
      {Object.keys(metricas.tiempoAhorradoDist).length > 0 && (
        <div className="card admin-seccion">
          <h2>Tiempo ahorrado declarado por usuarios</h2>
          <div className="distribucion-tipos">
            {Object.entries(metricas.tiempoAhorradoDist)
              .sort(([, a], [, b]) => b - a)
              .map(([clave, cantidad]) => (
                <div key={clave} className="tipo-barra-fila">
                  <span className="tipo-nombre">{ETIQUETAS_TIEMPO[clave] || clave}</span>
                  <div className="barra-contenedor">
                    <div
                      className="barra-relleno barra-verde"
                      style={{
                        width: `${Math.round((cantidad / metricas.totalEncuestados) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="tipo-cantidad">{cantidad}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Tabla de actividad reciente ── */}
      <div className="card admin-seccion">
        <h2>Actividad reciente</h2>
        {actividadReciente.length === 0 ? (
          <p className="sin-datos">No hay registros de actividad aún.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla-actividad">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Tipo</th>
                  <th>Confirmado</th>
                  <th>Estrellas</th>
                  <th>Tiempo ahorrado</th>
                  <th>Comentario</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {actividadReciente.map((r) => (
                  <tr key={r.id}>
                    <td>{formatearFecha(r.fecha_hora)}</td>
                    <td>{r.tipo_documento || '—'}</td>
                    <td>{r.confirmado ? '✅' : '—'}</td>
                    <td>{r.estrellas ? `${r.estrellas} ★` : '—'}</td>
                    <td>{r.tiempo_ahorrado ? ETIQUETAS_TIEMPO[r.tiempo_ahorrado] || r.tiempo_ahorrado : '—'}</td>
                    <td className="celda-comentario">{r.comentario || '—'}</td>
                    <td>
                      <button
                        className="btn-eliminar-fila"
                        onClick={() => manejarEliminarRegistro(r.id)}
                        disabled={eliminandoId === r.id}
                        title="Eliminar este registro"
                        aria-label="Eliminar registro"
                      >
                        {eliminandoId === r.id ? '...' : '🗑'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Acciones del panel ── */}
      <div className="admin-footer">
        <button
          className="btn-secundario"
          onClick={() => cargarDashboard(tokenAutenticado)}
          disabled={cargando}
        >
          Actualizar datos
        </button>

        {/* Botón de limpiar todo con paso de confirmación explícita.
            Requiere dos clics para evitar borrados accidentales. */}
        {!confirmandoLimpiar ? (
          <button
            className="btn-peligro"
            onClick={() => setConfirmandoLimpiar(true)}
            disabled={cargando}
          >
            🗑 Limpiar todos los registros
          </button>
        ) : (
          <div className="confirmacion-limpiar">
            <span>¿Seguro? Esta acción es irreversible.</span>
            <button className="btn-peligro" onClick={manejarLimpiarTodo} disabled={cargando}>
              Sí, borrar todo
            </button>
            <button className="btn-secundario" onClick={() => setConfirmandoLimpiar(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>

    </main>
  );
};

export default PaginaAdmin;

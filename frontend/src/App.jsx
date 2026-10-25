// Componente raíz de la aplicación.
// Responsabilidades:
//   1. Definir el layout general y la cabecera de DocPilot.
//   2. Gestionar la navegación entre las dos secciones principales (pestañas).
//   3. Controlar el modal de tratamiento de datos en la primera visita.
//
// El modal se muestra si localStorage NO tiene la clave 'docpilot_consentimiento_v1'.
// Las pestañas permiten cambiar entre el módulo de análisis y la ficha técnica.

import React, { useState, useEffect } from 'react';
import PaginaAnalisis from './pages/PaginaAnalisis';
import PaginaAcercaDe from './pages/PaginaAcercaDe';
import PaginaAdmin from './pages/PaginaAdmin';
import ModalTratamientoDatos from './components/ModalTratamientoDatos';

// Clave usada en localStorage para recordar que el usuario ya aceptó el tratamiento
const CLAVE_CONSENTIMIENTO = 'docpilot_consentimiento_v1';

const App = () => {
  // Pestaña activa — 'analisis' o 'acerca'
  const [paginaActiva, setPaginaActiva] = useState('analisis');

  // Controla si el modal de tratamiento de datos es visible.
  // Se inicializa verificando localStorage para no molestar a usuarios que ya aceptaron.
  const [mostrarModal, setMostrarModal] = useState(false);

  useEffect(() => {
    // Mostrar el modal solo si el usuario no ha aceptado antes en este navegador
    const yaAcepto = localStorage.getItem(CLAVE_CONSENTIMIENTO);
    if (!yaAcepto) {
      setMostrarModal(true);
    }
  }, []);

  /**
   * manejarAceptacionModal — se ejecuta cuando el usuario acepta el tratamiento.
   * Guarda la bandera en localStorage para no volver a mostrar el modal.
   */
  const manejarAceptacionModal = () => {
    localStorage.setItem(CLAVE_CONSENTIMIENTO, 'true');
    setMostrarModal(false);
  };

  /**
   * manejarCierreModal — se ejecuta si el usuario cierra el modal sin aceptar.
   * No guarda nada en localStorage: el modal volverá a aparecer en la próxima visita.
   */
  const manejarCierreModal = () => {
    setMostrarModal(false);
  };

  return (
    <div className="app-layout">

      {/* ── Modal de tratamiento de datos ──
          Se renderiza encima de todo el contenido.
          Solo es visible si el usuario no ha aceptado antes. */}
      {mostrarModal && (
        <ModalTratamientoDatos
          onAceptar={manejarAceptacionModal}
          onCerrar={manejarCierreModal}
        />
      )}

      {/* ── Cabecera DocPilot ── */}
      <header className="app-header">
        <div className="header-contenido">
          <div className="header-marca">
            <img
              src="/logo-docpilot.png"
              alt="Logo DocPilot"
              className="logo-uts-img"
            />
            <div className="header-divisor" />
            <div className="header-titulo">
              <span className="header-titulo-principal">DocPilot</span>
              <span className="header-titulo-sub">Analiza tus documentos con Inteligencia Artificial</span>
            </div>
          </div>
          <span className="header-badge">Asistente Documental IA</span>
        </div>
      </header>

      {/* ── Barra de navegación por pestañas ──
          Permite alternar entre el módulo de análisis y la ficha técnica del proyecto. */}
      <nav className="nav-pestanas" aria-label="Navegación principal">
        <div className="nav-pestanas-contenido">
          <button
            className={`nav-pestana ${paginaActiva === 'analisis' ? 'nav-pestana--activa' : ''}`}
            onClick={() => setPaginaActiva('analisis')}
            aria-current={paginaActiva === 'analisis' ? 'page' : undefined}
          >
            📋 Analizar documentos
          </button>
          <button
            className={`nav-pestana ${paginaActiva === 'acerca' ? 'nav-pestana--activa' : ''}`}
            onClick={() => setPaginaActiva('acerca')}
            aria-current={paginaActiva === 'acerca' ? 'page' : undefined}
          >
            ℹ️ Acerca del proyecto
          </button>
          {/* Acceso al panel admin — pequeño y discreto al final de la barra */}
          <button
            className={`nav-pestana nav-pestana--admin ${paginaActiva === 'admin' ? 'nav-pestana--activa' : ''}`}
            onClick={() => setPaginaActiva('admin')}
            aria-current={paginaActiva === 'admin' ? 'page' : undefined}
          >
            🔒 Admin
          </button>
        </div>
      </nav>

      {/* ── Contenido principal — renderiza la página activa ── */}
      <div className="app-main">
        {paginaActiva === 'analisis' && (
        <PaginaAnalisis onNuevaSesion={() => {
            // Solo mostrar el modal si el usuario aún no ha registrado su consentimiento.
            // Si ya aceptó (clave en localStorage), no interrumpir con el modal de nuevo.
            const yaAcepto = localStorage.getItem(CLAVE_CONSENTIMIENTO);
            if (!yaAcepto) setMostrarModal(true);
          }} />
      )}
        {paginaActiva === 'acerca'   && <PaginaAcercaDe />}
        {paginaActiva === 'admin'    && <PaginaAdmin />}
      </div>

      {/* ── Footer DocPilot ── */}
      <footer className="app-footer">
        <div className="footer-contenido">
          <p className="footer-proyecto">
            DocPilot — Asistente de análisis documental con Inteligencia Artificial
          </p>
          <p className="footer-creditos">
            Proyecto de Grado · Ingeniería de Sistemas · Unidades Tecnológicas de Santander
          </p>
          <p className="footer-autor">
            Mario Andrés Jácome Mantilla · 2026
          </p>
        </div>
      </footer>

    </div>
  );
};

export default App;


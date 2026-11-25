import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import PaginaAnalisis from './PaginaAnalisis';

const REGISTRO_ID = '3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b34';
const PERMISO = 'permiso-simulado';
const RESULTADO = {
  registroId: REGISTRO_ID,
  permisoAnalisis: PERMISO,
  registro: { guardado: true },
  datos: {
    tipo: 'Factura de prueba',
    resumen: 'Cobro ficticio por mantenimiento.',
    datosRelevantes: { total: 'COP 85.000' },
    sugerenciaRespuesta: 'Verifica el total y programa el pago.',
    alertas: null,
    _categoria: 'factura',
  },
};
const archivo = new File(['documento sintético'], 'factura-sintetica.png', { type: 'image/png' });
const fetchSimulado = vi.fn();

const botonAnalizar = () => screen.getByRole('button', { name: 'Analizar documento' });
const botonFinalizar = () => screen.getByRole('button', { name: /finalizar análisis/i });
const encuesta = () => screen.queryByRole('region', { name: 'Encuesta de utilidad' });

const cargar = async (usuario) => {
  await usuario.upload(screen.getByLabelText(/formatos aceptados/i), archivo);
  await usuario.click(botonAnalizar());
};

const responder = (cuerpo, status = 200) => fetchSimulado.mockResolvedValueOnce(Response.json(cuerpo, { status }));

beforeEach(() => {
  fetchSimulado.mockReset();
  fetchSimulado.mockRejectedValue(new Error('Petición no prevista en esta prueba.'));
  vi.stubGlobal('fetch', fetchSimulado);
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() { return 'blob:preview-sintetico'; }
    static revokeObjectURL() {}
  });
  vi.stubEnv('VITE_API_URL', '');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Flujo de análisis de documentos', () => {
  test('rechaza un tipo de archivo no admitido antes de enviarlo', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    render(<PaginaAnalisis />);
    await usuario.upload(screen.getByLabelText(/formatos aceptados/i), new File(['texto'], 'nota.txt', {
      type: 'text/plain',
    }));

    expect(screen.getByRole('alert')).toHaveTextContent('Tipo de archivo no permitido');
    expect(botonAnalizar()).toBeDisabled();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  test('carga el archivo, muestra el análisis y guarda la encuesta solo tras la revisión', async () => {
    const usuario = userEvent.setup();
    responder(RESULTADO);
    responder({ registroActualizado: true });
    responder({ mensaje: 'Valoración registrada.' });
    render(<PaginaAnalisis />);

    await cargar(usuario);
    expect(await screen.findByRole('heading', { name: 'Resultado del Análisis' })).toBeVisible();
    expect(screen.getByRole('img', { name: /previsualización: factura-sintetica/i })).toHaveAttribute('src', 'blob:preview-sintetico');
    expect(screen.getByText('Cobro ficticio por mantenimiento.')).toBeVisible();
    expect(screen.getByText('COP 85.000')).toBeVisible();
    expect(screen.getByText(RESULTADO.datos.sugerenciaRespuesta)).toBeVisible();
    expect(encuesta()).not.toBeInTheDocument();
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, solicitud] = fetchSimulado.mock.calls[0];
    expect(url).toBe('/api/documentos/analizar');
    expect(solicitud.headers).toEqual({ 'x-docpilot-analysis': '1' });
    expect(solicitud.body.get('documento').name).toBe(archivo.name);

    await usuario.click(botonFinalizar());
    expect(await screen.findByRole('region', { name: 'Encuesta de utilidad' })).toBeVisible();
    expect(JSON.parse(fetchSimulado.mock.calls[1][1].body)).toEqual({
      registroId: REGISTRO_ID, permisoAnalisis: PERMISO,
    });
    expect(fetchSimulado.mock.calls[1][0]).toBe('/api/documentos/confirmar');
    const codigo = screen.getByLabelText(/código del documento/i);
    expect(codigo).toHaveValue('FAC-');
    await usuario.clear(codigo);
    await usuario.type(codigo, 'FAC-S-001');
    await usuario.click(screen.getByRole('button', { name: '5 estrellas' }));
    await usuario.click(screen.getByRole('button', { name: /5.*15 min/i }));
    await usuario.click(screen.getByRole('button', { name: 'Enviar valoración' }));

    expect(await screen.findByText(/¡Confirmado!/)).toBeVisible();
    expect(fetchSimulado.mock.calls[2][0]).toBe('/api/documentos/encuesta');
    expect(JSON.parse(fetchSimulado.mock.calls[2][1].body)).toEqual({
      registroId: REGISTRO_ID, permisoAnalisis: PERMISO, estrellas: 5,
      tiempo_ahorrado: '5_15min', comentario: '[FAC-S-001]',
    });
  });

  test('muestra un fallo del análisis y deja reintentar con el mismo archivo', async () => {
    const usuario = userEvent.setup();
    responder({ error: 'El servicio de OCR no está disponible.' }, 502);
    responder(RESULTADO);
    render(<PaginaAnalisis />);

    await cargar(usuario);
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio de OCR no está disponible.');
    expect(screen.queryByRole('heading', { name: 'Resultado del Análisis' })).not.toBeInTheDocument();
    await usuario.click(botonAnalizar());

    expect(await screen.findByRole('heading', { name: 'Resultado del Análisis' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  test('mantiene el análisis visible ante un permiso vencido y usa el nuevo permiso tras repetirlo', async () => {
    const usuario = userEvent.setup();
    responder(RESULTADO);
    responder({
      error: 'El permiso de este análisis no es válido o venció. Vuelve a analizar el documento.',
      codigo: 'PERMISO_ANALISIS_INVALIDO',
    }, 403);
    responder({ ...RESULTADO, permisoAnalisis: 'permiso-renovado' });
    responder({ registroActualizado: true });
    render(<PaginaAnalisis />);

    await cargar(usuario);
    await usuario.click(await screen.findByRole('button', { name: /finalizar análisis/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vuelve a analizar el documento.');
    expect(screen.getByText(RESULTADO.datos.resumen)).toBeVisible();
    expect(encuesta()).not.toBeInTheDocument();

    await usuario.click(botonAnalizar());
    await usuario.click(await screen.findByRole('button', { name: /finalizar análisis/i }));
    expect(await screen.findByRole('region', { name: 'Encuesta de utilidad' })).toBeVisible();
    expect(JSON.parse(fetchSimulado.mock.calls[3][1].body).permisoAnalisis).toBe('permiso-renovado');
  });

  test('conserva la valoración si falla su guardado y permite volver a enviarla', async () => {
    const usuario = userEvent.setup();
    responder(RESULTADO);
    responder({ registroActualizado: true });
    responder({ error: 'No se pudo guardar la valoración.' }, 502);
    responder({ mensaje: 'Valoración registrada.' });
    render(<PaginaAnalisis />);

    await cargar(usuario);
    await usuario.click(await screen.findByRole('button', { name: /finalizar análisis/i }));
    await usuario.click(await screen.findByRole('button', { name: '4 estrellas' }));
    const botonEnviar = screen.getByRole('button', { name: 'Enviar valoración' });
    await usuario.click(botonEnviar);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la valoración.');
    expect(screen.getByText('Muy útil')).toBeVisible();
    expect(screen.queryByText(/¡Confirmado!/)).not.toBeInTheDocument();
    await usuario.click(botonEnviar);
    expect(await screen.findByText(/¡Confirmado!/)).toBeVisible();
    expect(fetchSimulado.mock.calls[3]).toEqual(fetchSimulado.mock.calls[2]);
    expect(JSON.parse(fetchSimulado.mock.calls[3][1].body).comentario).toBeNull();
  });
});

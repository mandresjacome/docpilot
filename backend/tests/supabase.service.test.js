// Pruebas del servicio de Supabase con el cliente simulado.
// Objetivo: garantizar que NINGUNA operación declara éxito cuando el guardado falló.

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => require('./helpers/supabaseMock').cliente,
}));

const supabaseMock = require('./helpers/supabaseMock');
const servicio = require('../services/supabase.service');

const ID = '3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b34';

beforeEach(() => supabaseMock.reiniciar());

describe('registrarUsoConRetorno', () => {
  test('inserta en registros_uso y devuelve el id', async () => {
    supabaseMock.responder({ data: { id: ID } });

    const { data } = await servicio.registrarUsoConRetorno({
      tipo_documento: 'factura',
      tiempo_ms: 1200,
      confirmado: false,
      correo_usuario: 'ana@example.com',
    });

    expect(data).toEqual({ id: ID });
    expect(supabaseMock.llamo('from')[0].args).toEqual(['registros_uso']);
    expect(supabaseMock.llamo('insert')[0].args[0]).toEqual([
      { tipo_documento: 'factura', tiempo_ms: 1200, confirmado: false, correo_usuario: 'ana@example.com' },
    ]);
  });

  test('aplica valores por defecto cuando faltan datos', async () => {
    supabaseMock.responder({ data: { id: ID } });
    await servicio.registrarUsoConRetorno({});
    expect(supabaseMock.llamo('insert')[0].args[0][0]).toEqual({
      tipo_documento: 'desconocido',
      tiempo_ms: null,
      confirmado: false,
      correo_usuario: null,
    });
  });

  test('lanza ErrorPersistencia (502) si Supabase devuelve un error', async () => {
    supabaseMock.responder({ error: { message: 'duplicate key' } });

    await expect(servicio.registrarUsoConRetorno({ tipo_documento: 'contrato' })).rejects.toMatchObject({
      name: 'ErrorPersistencia',
      status: 502,
      codigo: 'PERSISTENCIA_FALLIDA',
    });
  });

  test('lanza ErrorPersistencia si falla la red (excepción)', async () => {
    supabaseMock.lanzar(new Error('fetch failed'));

    const promesa = servicio.registrarUsoConRetorno({});
    await expect(promesa).rejects.toBeInstanceOf(servicio.ErrorPersistencia);
    await expect(promesa).rejects.toMatchObject({ causa: expect.objectContaining({ message: 'fetch failed' }) });
  });

  test('lanza error si la respuesta no trae id (no hay éxito falso)', async () => {
    supabaseMock.responder({ data: null });
    await expect(servicio.registrarUsoConRetorno({})).rejects.toBeInstanceOf(servicio.ErrorPersistencia);
  });

  test('el mensaje al usuario no filtra detalles internos de Supabase', async () => {
    supabaseMock.responder({ error: { message: 'relation "registros_uso" does not exist' } });
    const error = await servicio.registrarUsoConRetorno({}).catch((e) => e);
    expect(error.message).not.toMatch(/relation|registros_uso/);
  });
});

describe('registrarUso', () => {
  test('resuelve cuando el insert funciona', async () => {
    supabaseMock.responder({ data: null });
    await expect(servicio.registrarUso({ tipo_documento: 'carta' })).resolves.toBeUndefined();
  });

  test('lanza ErrorPersistencia si el insert falla', async () => {
    supabaseMock.responder({ error: { message: 'boom' } });
    await expect(servicio.registrarUso({ tipo_documento: 'carta' })).rejects.toBeInstanceOf(
      servicio.ErrorPersistencia
    );
  });
});

describe('marcarConfirmado', () => {
  test('actualiza confirmado=true por id', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });
    await servicio.marcarConfirmado(ID);
    expect(supabaseMock.llamo('update')[0].args[0]).toEqual({ confirmado: true });
    expect(supabaseMock.llamo('eq')[0].args).toEqual(['id', ID]);
  });

  test('lanza 404 si el registro no existe (0 filas actualizadas)', async () => {
    supabaseMock.responder({ data: [] });
    await expect(servicio.marcarConfirmado(ID)).rejects.toMatchObject({
      status: 404,
      codigo: 'REGISTRO_NO_ENCONTRADO',
    });
  });

  test('lanza 502 si Supabase falla', async () => {
    supabaseMock.responder({ error: { message: 'timeout' } });
    await expect(servicio.marcarConfirmado(ID)).rejects.toMatchObject({ status: 502 });
  });
});

describe('registrarEncuesta', () => {
  test('actualiza valoración y trunca el comentario a 200 caracteres', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });

    await servicio.registrarEncuesta({
      id: ID,
      estrellas: 5,
      tiempo_ahorrado: '10-30 min',
      comentario: 'x'.repeat(500),
    });

    const cambios = supabaseMock.llamo('update')[0].args[0];
    expect(cambios.estrellas).toBe(5);
    expect(cambios.tiempo_ahorrado).toBe('10-30 min');
    expect(cambios.comentario).toHaveLength(200);
  });

  test('guarda null en los campos opcionales ausentes', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });
    await servicio.registrarEncuesta({ id: ID, estrellas: 4 });
    expect(supabaseMock.llamo('update')[0].args[0]).toEqual({
      estrellas: 4,
      tiempo_ahorrado: null,
      comentario: null,
    });
  });

  test('lanza 404 si el id no existe y 502 si falla Supabase', async () => {
    supabaseMock.responder({ data: [] });
    await expect(servicio.registrarEncuesta({ id: ID, estrellas: 3 })).rejects.toMatchObject({ status: 404 });

    supabaseMock.responder({ error: { message: 'caído' } });
    await expect(servicio.registrarEncuesta({ id: ID, estrellas: 3 })).rejects.toMatchObject({ status: 502 });
  });
});

describe('obtenerEstadisticas', () => {
  test('devuelve los registros ordenados con límite de 500', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });
    await expect(servicio.obtenerEstadisticas()).resolves.toEqual([{ id: ID }]);
    expect(supabaseMock.llamo('order')[0].args).toEqual(['fecha_hora', { ascending: false }]);
    expect(supabaseMock.llamo('limit')[0].args).toEqual([500]);
  });

  test('devuelve [] cuando realmente no hay datos', async () => {
    supabaseMock.responder({ data: null });
    await expect(servicio.obtenerEstadisticas()).resolves.toEqual([]);
  });

  test('lanza error (no devuelve [] engañoso) si la consulta falla', async () => {
    supabaseMock.responder({ error: { message: 'permission denied' } });
    await expect(servicio.obtenerEstadisticas()).rejects.toMatchObject({ status: 502 });
  });
});

describe('eliminarRegistro y limpiarTodosLosRegistros', () => {
  test('eliminarRegistro borra por id', async () => {
    supabaseMock.responder({ data: [{ id: ID }] });
    await servicio.eliminarRegistro(ID);
    expect(supabaseMock.llamo('delete')).toHaveLength(1);
    expect(supabaseMock.llamo('eq')[0].args).toEqual(['id', ID]);
  });

  test('eliminarRegistro lanza 404 si no existía y 502 si falla', async () => {
    supabaseMock.responder({ data: [] });
    await expect(servicio.eliminarRegistro(ID)).rejects.toMatchObject({ status: 404 });

    supabaseMock.responder({ error: { message: 'x' } });
    await expect(servicio.eliminarRegistro(ID)).rejects.toMatchObject({ status: 502 });
  });

  test('limpiarTodosLosRegistros borra todas las filas', async () => {
    supabaseMock.responder({ data: null });
    await servicio.limpiarTodosLosRegistros();
    expect(supabaseMock.llamo('not')[0].args).toEqual(['id', 'is', null]);
  });

  test('limpiarTodosLosRegistros lanza 502 si falla', async () => {
    supabaseMock.lanzar(new Error('red caída'));
    await expect(servicio.limpiarTodosLosRegistros()).rejects.toMatchObject({ status: 502 });
  });
});

// Cliente de Supabase simulado para las pruebas.
// Imita la API encadenable de supabase-js (from().insert().select().single(), etc.) y
// permite decidir, por prueba, qué resultado devuelve o qué excepción lanza.
// Se usa con: jest.mock('@supabase/supabase-js', () => ({ createClient: () => require('./helpers/supabaseMock').cliente }))

const estado = {
  respuesta: { data: null, error: null },
  excepcion: null,
};

const llamadas = [];

// Cada método registra su invocación y devuelve la misma consulta "thenable":
// al hacer `await consulta` se resuelve con la respuesta configurada (o se rechaza).
const consulta = {};
['insert', 'update', 'delete', 'select', 'eq', 'not', 'order', 'limit', 'single'].forEach((metodo) => {
  consulta[metodo] = jest.fn((...args) => {
    llamadas.push({ metodo, args });
    return consulta;
  });
});
consulta.then = (resolver, rechazar) =>
  Promise.resolve()
    .then(() => {
      if (estado.excepcion) throw estado.excepcion;
      return estado.respuesta;
    })
    .then(resolver, rechazar);

const cliente = {
  from: jest.fn((tabla) => {
    llamadas.push({ metodo: 'from', args: [tabla] });
    return consulta;
  }),
};

/** Configura la respuesta de la próxima(s) consulta(s): { data, error }. */
const responder = (respuesta) => {
  estado.respuesta = { data: null, error: null, ...respuesta };
  estado.excepcion = null;
};

/** Hace que las consultas lancen una excepción (p. ej. caída de red). */
const lanzar = (error) => {
  estado.excepcion = error;
};

const reiniciar = () => {
  estado.respuesta = { data: null, error: null };
  estado.excepcion = null;
  llamadas.length = 0;
};

const llamo = (metodo) => llamadas.filter((l) => l.metodo === metodo);

module.exports = { cliente, responder, lanzar, reiniciar, llamadas, llamo };

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import PaginaAdmin from './PaginaAdmin';

const CLAVE_SESION = 'docpilot_admin_token';

afterEach(() => {
  cleanup();
  sessionStorage.removeItem(CLAVE_SESION);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('un token rechazado deja disponible el formulario para reintentar', async () => {
  const usuario = userEvent.setup();
  sessionStorage.setItem(CLAVE_SESION, 'token-sintetico-vencido');
  vi.stubEnv('VITE_API_URL', '');
  const fetchSimulado = vi.fn().mockResolvedValue(Response.json({ error: 'Acceso no autorizado.' }, {
    status: 401,
  }));
  vi.stubGlobal('fetch', fetchSimulado);
  render(<PaginaAdmin />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Token de acceso incorrecto');
  expect(sessionStorage.getItem(CLAVE_SESION)).toBeNull();
  expect(screen.getByRole('button', { name: 'Acceder' })).toBeEnabled();

  await usuario.type(screen.getByLabelText('Token de acceso'), 'otro-token-sintetico');
  await usuario.click(screen.getByRole('button', { name: 'Acceder' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Token de acceso incorrecto');
  expect(fetchSimulado).toHaveBeenLastCalledWith('/api/admin/dashboard', expect.objectContaining({
    headers: { 'x-admin-token': 'otro-token-sintetico' },
  }));
});

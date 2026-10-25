// Pruebas de la defensa contra bombas de descompresión en PDF.
// Los PDF "bomba" se construyen en memoria: pesan menos de 1 MB y se inflan a cientos de MB.

const zlib = require('zlib');
const { verificarExpansionPDF } = require('../services/seguridadPDF.service');
const { crearPDF } = require('./helpers/archivos');

const MB = 1024 * 1024;
jest.setTimeout(30000);

// Arma un PDF mínimo con un flujo (object stream) ya comprimido. `extraDic` permite añadir claves al diccionario.
const pdfConFlujos = (flujos, { usarLength = true } = {}) => {
  const partes = [Buffer.from('%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')];
  flujos.forEach((datos, i) => {
    const length = usarLength ? `/Length ${datos.length}` : '/Length 99 0 R';
    partes.push(
      Buffer.from(`${i + 4} 0 obj\n<< /Type /ObjStm /N 1 /First 5 /Filter /FlateDecode ${length} >>\nstream\n`),
      datos,
      Buffer.from('\nendstream\nendobj\n')
    );
  });
  partes.push(Buffer.from('trailer\n<< /Root 1 0 R /Size 9 >>\n%%EOF\n'));
  return Buffer.concat(partes);
};

const ceros = (mb) => zlib.deflateSync(Buffer.alloc(mb * MB), { level: 9 });

describe('verificarExpansionPDF — PDF legítimos', () => {
  test('acepta un PDF normal (incluye object streams generados por pdf-lib)', async () => {
    expect(await verificarExpansionPDF(await crearPDF(5))).toBeNull();
  });

  test('acepta un PDF de 100 páginas', async () => {
    expect(await verificarExpansionPDF(await crearPDF(100))).toBeNull();
  });

  test('acepta un flujo grande pero razonable (50 MB inflado)', async () => {
    expect(await verificarExpansionPDF(pdfConFlujos([ceros(50)]))).toBeNull();
  });

  test('no se confunde con "endstream" ni con texto sin flujos', async () => {
    expect(await verificarExpansionPDF(Buffer.from('%PDF-1.4 endstream endstream endobj %%EOF'))).toBeNull();
  });

  test('ignora flujos que no son zlib (p. ej. JPEG embebido)', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    expect(await verificarExpansionPDF(pdfConFlujos([jpeg]))).toBeNull();
  });
});

describe('verificarExpansionPDF — bombas de descompresión', () => {
  test('rechaza un flujo que se infla por encima del tope (120 MB desde < 1 MB)', async () => {
    const comprimido = ceros(120);
    expect(comprimido.length).toBeLessThan(1 * MB);
    const motivo = await verificarExpansionPDF(pdfConFlujos([comprimido]));
    expect(motivo).toMatch(/desproporcionada/);
  });

  test('rechaza varios flujos que individualmente no superan el tope pero sí el total (3 × 80 MB)', async () => {
    const c = ceros(80);
    const motivo = await verificarExpansionPDF(pdfConFlujos([c, c, c]));
    expect(motivo).toMatch(/desproporcionada/);
  });

  test('rechaza aunque /Length sea indirecto (se usa la búsqueda de endstream)', async () => {
    const motivo = await verificarExpansionPDF(pdfConFlujos([ceros(120)], { usarLength: false }));
    expect(motivo).toMatch(/desproporcionada/);
  });

  test('rechaza una bomba escondida tras un falso "endstream" dentro de los datos (usa /Length)', async () => {
    // Deflate con un bloque "stored" que contiene el texto "endstream" y después ceros comprimidos
    const comprimido = await new Promise((resolve, reject) => {
      const d = zlib.createDeflate({ level: 0 });
      const partes = [];
      d.on('data', (p) => partes.push(p));
      d.on('end', () => resolve(Buffer.concat(partes)));
      d.on('error', reject);
      d.write(Buffer.from('aaaa\nendstream\nbbbb'));
      d.flush(zlib.constants.Z_FULL_FLUSH, () => {
        d.params(9, zlib.constants.Z_DEFAULT_STRATEGY, () => d.end(Buffer.alloc(120 * MB)));
      });
    });
    expect(comprimido.includes('endstream')).toBe(true);

    const motivo = await verificarExpansionPDF(pdfConFlujos([comprimido]));
    expect(motivo).toMatch(/desproporcionada/);
  });
});

describe('verificarExpansionPDF — robustez frente a archivos hostiles', () => {
  test('un archivo con un millón de palabras "stream" termina rápido', async () => {
    const hostil = Buffer.from('stream\n'.repeat(1_000_000));
    const t0 = Date.now();
    await verificarExpansionPDF(hostil);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('muchísimos flujos diminutos se rechazan por cantidad anormal', async () => {
    const hostil = Buffer.from('1 0 obj\n<< /Length 1 >>\nstream\nx\nendstream\n'.repeat(30000));
    const t0 = Date.now();
    const motivo = await verificarExpansionPDF(hostil);
    expect(motivo).toMatch(/anormalmente alta/);
    expect(Date.now() - t0).toBeLessThan(15000);
  });
});

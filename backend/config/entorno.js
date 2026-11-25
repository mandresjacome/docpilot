const path = require('node:path');
const dotenv = require('dotenv');

const carpetaBackend = path.resolve(__dirname, '..');
const HOST_LOCAL = '127.0.0.1';

if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.join(carpetaBackend, '.env') });
}

module.exports = { carpetaBackend, HOST_LOCAL };

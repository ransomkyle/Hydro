import fs from 'node:fs';
import https from 'node:https';
import { createApp } from './app.js';
import path from 'node:path';
import { DATA_DIR, PORT } from './config.js';
import { seed } from './seed.js';

seed({ demoUsers: process.env.QC_DEMO === '1' });
// PID file lets `npm run restore` refuse to run while the server is up.
const pidFile = path.join(DATA_DIR, 'server.pid');
fs.writeFileSync(pidFile, String(process.pid));
const cleanup = () => { fs.rmSync(pidFile, { force: true }); };
process.on('exit', cleanup); process.on('SIGINT', () => process.exit(0)); process.on('SIGTERM', () => process.exit(0));
const app = createApp();

// Browsers only allow the camera, GPS, service worker and offline PIN crypto on HTTPS (or localhost).
// For a shop-network server, set QC_TLS_CERT / QC_TLS_KEY (see scripts/make-cert.sh) or put a reverse proxy (Caddy/nginx) in front.
const { QC_TLS_CERT, QC_TLS_KEY } = process.env;
if (QC_TLS_CERT && QC_TLS_KEY) {
  https.createServer({ cert: fs.readFileSync(QC_TLS_CERT), key: fs.readFileSync(QC_TLS_KEY) }, app)
    .listen(PORT, '0.0.0.0', () => console.log(`DAD Shipping QC listening on https://0.0.0.0:${PORT}`));
} else {
  app.listen(PORT, '0.0.0.0', () => console.log(`DAD Shipping QC listening on http://0.0.0.0:${PORT}  (HTTP: offline mode, camera and GPS only work on localhost — use HTTPS on the shop network)`));
}

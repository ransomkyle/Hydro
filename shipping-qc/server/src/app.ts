import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ON_TIME_GRACE_MIN, PLANTS, REQUIRE_APPROVED_TEMPLATES, WEB_DIST } from './config.js';
import { authenticate } from './auth.js';
import { authRouter, usersRouter } from './routes/users.js';
import { router as attachments } from './routes/attachments.js';
import { router as analytics } from './routes/analytics.js';
import { router as capas } from './routes/capas.js';
import { router as gauges } from './routes/gauges.js';
import { router as imports } from './routes/imports.js';
import { router as reports } from './routes/reports.js';
import { router as shipments } from './routes/shipments.js';
import { router as templates } from './routes/templates.js';
import { errorHandler } from './util.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.get('/api/meta', authenticate, (_req, res) => res.json({ plants: PLANTS, requireApprovedTemplates: REQUIRE_APPROVED_TEMPLATES, onTimeGraceMin: ON_TIME_GRACE_MIN }));
  app.use('/api/gauges', gauges);
  app.use('/api/capas', capas);
  app.use('/api', imports);
  app.use('/api/templates', templates);
  app.use('/api/shipments', shipments);
  app.use('/api', attachments);
  app.use('/api', analytics);
  app.use('/api', reports);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(WEB_DIST, 'index.html')); });
  }
  app.use(errorHandler);
  return app;
}

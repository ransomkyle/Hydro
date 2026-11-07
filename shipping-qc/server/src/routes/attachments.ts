import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { audit } from '../audit.js';
import { authenticate, requireRole } from '../auth.js';
import { MAX_UPLOAD_MB, UPLOAD_DIR } from '../config.js';
import { db, nowIso } from '../db.js';
import { alreadyProcessed, effectiveTime, HttpError, wrap } from '../util.js';
import { loadDetail } from './shipments.js';

export const router = Router();
router.use(authenticate);

// No SVG/HTML: uploaded files are served from the app origin, so only inert types are accepted.
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf' };

function sniff(buf: Buffer, mime: string): boolean {
  const h = buf.subarray(0, 12);
  if (mime === 'application/pdf') return h.subarray(0, 4).toString() === '%PDF';
  if (mime === 'image/jpeg') return h[0] === 0xff && h[1] === 0xd8;
  if (mime === 'image/png') return h[0] === 0x89 && h.subarray(1, 4).toString() === 'PNG';
  if (mime === 'image/webp') return h.subarray(0, 4).toString() === 'RIFF' && h.subarray(8, 12).toString() === 'WEBP';
  return h.subarray(4, 8).toString() === 'ftyp'; // heic/heif
}

router.post('/shipments/:id/attachments', requireRole('operator', 'inspector', 'manager', 'shipping', 'admin'), upload.single('file'), wrap((req, res) => {
  const shipmentId = Number(req.params.id);
  const ship = db.prepare('SELECT id,status FROM shipments WHERE id=?').get(shipmentId) as any;
  if (!ship) throw new HttpError(404, 'Shipment not found');
  if (ship.status === 'cancelled') throw new HttpError(409, 'Shipment is cancelled');
  const f = req.file;
  if (!f) throw new HttpError(400, 'No file uploaded');
  const b = z.object({
    kind: z.enum(['photo', 'mtr', 'cert', 'inspection', 'drawing', 'other']).default('other'),
    caption: z.string().max(300).optional(), itemId: z.coerce.number().int().optional(),
    opId: z.string().max(80).optional(), offline: z.enum(['1', '0', 'true', 'false']).optional(), clientAt: z.string().max(40).optional(),
  }).parse(req.body);
  if (!ALLOWED.has(f.mimetype) || !sniff(f.buffer, f.mimetype)) throw new HttpError(415, 'Only JPEG, PNG, WebP, HEIC photos and PDF documents are allowed');
  if (b.itemId) {
    const it = db.prepare('SELECT shipment_id FROM checklist_items WHERE id=?').get(b.itemId) as any;
    if (!it || it.shipment_id !== shipmentId) throw new HttpError(400, 'Checklist item does not belong to this shipment');
  }
  if (alreadyProcessed(b.opId, req.user!.id)) return res.json({ duplicate: true, ...loadDetail(shipmentId) });
  const offline = b.offline === '1' || b.offline === 'true';
  const at = effectiveTime(offline, b.clientAt);
  const sha = crypto.createHash('sha256').update(f.buffer).digest('hex');
  const stored = sha + EXT[f.mimetype];
  const dest = path.join(UPLOAD_DIR, stored);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, f.buffer, { mode: 0o640 });
  const filename = path.basename(f.originalname || 'upload').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  db.transaction(() => {
    const r = db.prepare(`INSERT INTO attachments(shipment_id,item_id,kind,filename,mime,size,sha256,stored_as,caption,uploaded_by,uploaded_at,received_at,offline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(shipmentId, b.itemId ?? null, b.kind, filename, f.mimetype, f.size, sha, stored, b.caption ?? null, req.user!.id, at, nowIso(), offline ? 1 : 0);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'attachment.add', entity: 'attachment', entityId: Number(r.lastInsertRowid), shipmentId, eventAt: at, offline,
      detail: { kind: b.kind, filename, mime: f.mimetype, size: f.size, sha256: sha, itemId: b.itemId ?? null, caption: b.caption } });
  })();
  res.status(201).json(loadDetail(shipmentId));
}));

router.get('/attachments/:id', wrap((req, res) => {
  const a = db.prepare('SELECT * FROM attachments WHERE id=?').get(Number(req.params.id)) as any;
  if (!a) throw new HttpError(404, 'Attachment not found');
  const file = path.join(UPLOAD_DIR, a.stored_as);
  if (!fs.existsSync(file)) throw new HttpError(404, 'File missing on disk');
  res.setHeader('Content-Type', a.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${a.filename.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(file).pipe(res);
}));

router.post('/attachments/:id/void', requireRole('inspector', 'manager', 'admin'), wrap((req, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
  const a = db.prepare('SELECT * FROM attachments WHERE id=?').get(Number(req.params.id)) as any;
  if (!a) throw new HttpError(404, 'Attachment not found');
  db.transaction(() => {
    db.prepare('UPDATE attachments SET voided=1,void_reason=?,voided_by=?,voided_at=? WHERE id=?').run(reason, req.user!.id, nowIso(), a.id);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'attachment.void', entity: 'attachment', entityId: a.id, shipmentId: a.shipment_id, detail: { reason, filename: a.filename, sha256: a.sha256 } });
  })();
  res.json(loadDetail(a.shipment_id));
}));

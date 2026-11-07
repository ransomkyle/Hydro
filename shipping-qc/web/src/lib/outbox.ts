/**
 * Offline outbox. Actions that must keep working on a spotty shop-floor network (sign-offs, verifications, materials,
 * logistics events, photos/documents) are sent immediately when possible and queued in IndexedDB otherwise.
 * Every queued action carries its original device timestamp and a unique op id so replays are exactly-once.
 */
import { ApiError, NetworkError, get, post, postForm } from './api';
import { canonical, checkPinLocally, makeProof, uuid } from './crypto';
import { idb } from './idb';

export type OpKind = 'sign' | 'verify' | 'material' | 'event' | 'attachment';
export interface Op {
  id: string; kind: OpKind; shipmentId: number; itemId?: number;
  userId: number; userName: string;
  path: string; body: Record<string, any>;           // JSON body (or form fields for attachments)
  file?: Blob; fileName?: string;
  needsProof: boolean;                                // PIN-bearing ops are authenticated by their HMAC proof, not the session
  clientAt: string; createdAt: number;
  status: 'pending' | 'rejected';
  error?: string;
  label: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();
export const onOutboxChange = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach(fn => fn());

export const listOps = async () => (await idb.all<Op>('outbox')).sort((a, b) => a.createdAt - b.createdAt);
export const countPending = async () => (await listOps()).filter(o => o.status === 'pending').length;
export const discardOp = async (id: string) => { await idb.del('outbox', id); emit(); };

async function enqueue(op: Op) { await idb.put('outbox', op); emit(); }

export type SendResult = { queued: false; data: any } | { queued: true; op: Op };

export interface Ctx { userId: number; userName: string; pinSalt?: string; pinVerifier?: string }

async function trySend(op: Op): Promise<any> {
  if (op.file) {
    const f = new FormData();
    for (const [k, v] of Object.entries(op.body)) if (v !== undefined && v !== null) f.append(k, String(v));
    f.append('file', op.file, op.fileName ?? 'upload');
    return postForm(op.path, f);
  }
  return post(op.path, op.body);
}

/** Sign (pass/fail/na) or verify an item. The PIN is used here and discarded — only a proof is ever queued. */
export async function signItem(ctx: Ctx, args: { action: 'sign' | 'verify'; shipmentId: number; itemId: number; itemText: string; result?: string; value?: string; note?: string; pin: string }): Promise<SendResult> {
  const opId = uuid(); const clientAt = new Date().toISOString();
  const fields = { opId, result: args.result, value: args.value || undefined, note: args.note || undefined, clientAt };
  const path = `/shipments/items/${args.itemId}/${args.action}`;
  const label = `${args.action === 'verify' ? 'Verify' : (args.result ?? 'sign').toUpperCase()}: ${args.itemText}`;
  try {
    const data = await post(path, { ...fields, pin: args.pin });
    return { queued: false, data };
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    if (!window.isSecureContext || !crypto.subtle) throw new ApiError(400, 'Offline sign-off needs this app to be opened over HTTPS. Ask IT to enable HTTPS on the QC server.');
    if (!ctx.pinSalt || !ctx.pinVerifier) throw new ApiError(400, 'Offline sign-off needs a PIN set while online first');
    if (!(await checkPinLocally(args.pin, ctx.pinSalt, ctx.pinVerifier))) throw new ApiError(403, 'Incorrect PIN');
    const proof = await makeProof(args.pin, ctx.pinSalt, canonical(args.action, args.itemId, fields));
    const op: Op = { id: opId, kind: args.action, shipmentId: args.shipmentId, itemId: args.itemId, userId: ctx.userId, userName: ctx.userName, path,
      body: { ...fields, offline: true, userId: ctx.userId, proof }, needsProof: true, clientAt, createdAt: Date.now(), status: 'pending', label };
    await enqueue(op);
    return { queued: true, op };
  }
}

export async function sendOrQueue(ctx: Ctx, kind: Exclude<OpKind, 'sign' | 'verify'>, shipmentId: number, path: string, body: Record<string, any>, label: string, file?: { blob: Blob; name: string }): Promise<SendResult> {
  const opId = uuid(); const clientAt = new Date().toISOString();
  const op: Op = { id: opId, kind, shipmentId, userId: ctx.userId, userName: ctx.userName, path, body: { ...body, opId, clientAt }, file: file?.blob, fileName: file?.name,
    needsProof: false, clientAt, createdAt: Date.now(), status: 'pending', label };
  try {
    return { queued: false, data: await trySend(op) };
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    op.body.offline = kind === 'attachment' ? '1' : true;
    await enqueue(op);
    return { queued: true, op };
  }
}

let syncing = false;
/** Replays queued ops in order. Returns true if anything was delivered. */
export async function syncOutbox(currentUserId: number | null): Promise<boolean> {
  if (syncing || currentUserId === null || !navigator.onLine) return false;
  syncing = true;
  let delivered = false;
  try {
    for (const op of await listOps()) {
      if (op.status !== 'pending') continue;
      if (!op.needsProof && op.userId !== currentUserId) continue; // wait for the right person to sign in
      try {
        await trySend(op);
        await idb.del('outbox', op.id); delivered = true; emit();
      } catch (e) {
        if (e instanceof NetworkError) break;
        if (e instanceof ApiError && e.status === 401) break;
        const msg = e instanceof ApiError ? e.message : String(e);
        await idb.put('outbox', { ...op, status: 'rejected', error: msg }); emit();
      }
    }
  } finally { syncing = false; }
  if (delivered) get('/auth/me').catch(() => {});
  return delivered;
}

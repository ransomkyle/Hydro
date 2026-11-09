/**
 * Offline sign-off proofs. The PIN is never stored or sent while offline:
 *   key   = PBKDF2-SHA256(pin, salt, 150k)             (salt comes from the server at login)
 *   check = SHA-256(key)                               (matches the verifier the server gave us -> PIN typo caught locally)
 *   proof = HMAC-SHA256(key, canonical operation)      (server holds the same key and re-verifies on sync)
 * Keep `canonical` identical to canonicalSign() in server/src/routes/shipments.ts.
 */
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)));

export async function deriveKey(pin: string, saltHex: string): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: 150_000 }, base, 256);
}

export async function checkPinLocally(pin: string, saltHex: string, verifierHex: string): Promise<boolean> {
  return hex(await crypto.subtle.digest('SHA-256', await deriveKey(pin, saltHex))) === verifierHex;
}

export const canonical = (action: string, itemId: number, b: { opId?: string; result?: string; value?: string; note?: string; clientAt?: string; gauge?: string }) =>
  [b.opId ?? '', action, itemId, b.result ?? '', b.value ?? '', b.note ?? '', b.clientAt ?? '', b.gauge ?? ''].join('|');

export async function makeProof(pin: string, saltHex: string, canon: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', await deriveKey(pin, saltHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(canon)));
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'op-' + Date.now() + '-' + Math.random().toString(16).slice(2));

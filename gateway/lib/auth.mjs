import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { GatewayError } from './queue.mjs';
export const hash = (value, secret) => createHmac('sha256', secret).update(value).digest('hex');
export function equal(a = '', b = '') { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x,y); }
export function issue(secret, now = Date.now()) { const body = Buffer.from(JSON.stringify({ id: randomUUID(), exp: now + 7 * 86400000 })).toString('base64url'); return `${body}.${hash(body,secret)}`; }
export function identify(token, ip, secret, now = Date.now()) {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra || !equal(hash(body, secret), sig)) throw new GatewayError('session_invalid', 401);
  let data; try { data = JSON.parse(Buffer.from(body, 'base64url')); } catch { throw new GatewayError('session_invalid', 401); }
  if (!data.id || data.exp < now || !ip) throw new GatewayError('session_invalid', 401);
  return { visitor: data.id, ip: hash(ip, secret) };
}

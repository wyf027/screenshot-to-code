import { randomUUID } from 'node:crypto';

export const LIMITS = Object.freeze({ visitor: 20000, global: 200000, minimum: 6000, queue: 5 });
export class GatewayError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const dayKey = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const pending = job => ['queued', 'running'].includes(job.status);
const newDay = () => ({ used: 0, reserved: 0, people: {}, unknown: [] });
const ledger = (state, day) => state.days[day] ||= newDay();
const person = (day, key) => day.people[key] ||= { used: 0, reserved: 0 };
const keys = job => [`visitor:${job.visitor}`, `ip:${job.ip}`];

export function freshState() { return { jobs: {}, days: {}, heartbeat: 0 }; }
export function quota(state, identity, now) {
  const day = state.days[dayKey(now)] || newDay();
  const people = keys(identity).map(k => day.people[k] || { used: 0, reserved: 0 });
  const used = Math.max(...people.map(p => p.used));
  const reserved = Math.max(...people.map(p => p.reserved));
  return { day: dayKey(now), used, reserved, remaining: Math.max(0, LIMITS.visitor - used - reserved), limit: LIMITS.visitor,
    globalUsed: day.used, globalReserved: day.reserved, globalRemaining: Math.max(0, LIMITS.global - day.used - day.reserved), globalLimit: LIMITS.global,
    unknownUsage: day.unknown.length > 0, online: now - state.heartbeat < 45000,
    resetsAt: new Date(Date.parse(`${dayKey(now)}T00:00:00+08:00`) + 86400000).toISOString() };
}
function reserve(state, job, now) {
  const q = quota(state, job, now);
  if (q.unknownUsage) throw new GatewayError('usage_unknown', 503);
  const amount = Math.min(q.remaining, q.globalRemaining, LIMITS.visitor);
  if (amount < LIMITS.minimum) throw new GatewayError('daily_limit', 429);
  const day = ledger(state, dayKey(now));
  if (Object.keys(day.people).length >= 2048 && keys(job).some(k => !day.people[k])) throw new GatewayError('daily_limit', 429);
  job.day = dayKey(now); job.reservation = amount;
  day.reserved += amount;
  for (const key of keys(job)) person(day, key).reserved += amount;
}
function release(state, job) {
  const day = ledger(state, job.day);
  day.reserved -= job.reservation;
  for (const key of keys(job)) person(day, key).reserved -= job.reservation;
}
export function expire(state, now) {
  for (const job of Object.values(state.jobs)) {
    if (job.status === 'queued' && now - job.createdAt > 10 * 60000) {
      release(state, job); job.status = 'expired'; job.error = 'queue_expired'; job.finishedAt = now; job.accounted = true;
    } else if (job.status === 'running' && now > job.deadline) {
      job.status = 'expired'; job.error = 'usage_unknown'; job.finishedAt = now;
      const day = ledger(state, job.day); if (!day.unknown.includes(job.id)) day.unknown.push(job.id);
    }
  }
  const removed = [];
  for (const [id, job] of Object.entries(state.jobs)) if (!pending(job) && now - job.finishedAt > 86400000) { removed.push(id); delete state.jobs[id]; }
  for (const day of Object.keys(state.days)) if (Date.parse(`${day}T00:00:00+08:00`) < now - 8 * 86400000) delete state.days[day];
  return removed;
}
export function submit(state, identity, now, id = randomUUID()) {
  expire(state, now);
  if (now - state.heartbeat >= 45000) throw new GatewayError('worker_offline', 503);
  const active = Object.values(state.jobs).filter(pending);
  if (active.some(j => j.visitor === identity.visitor || j.ip === identity.ip)) throw new GatewayError('already_running', 409);
  if (active.length >= LIMITS.queue + 1) throw new GatewayError('queue_full', 429);
  const job = { id, ...identity, createdAt: now, status: 'queued' };
  reserve(state, job, now); state.jobs[id] = job;
  return job;
}
export function claim(state, now) {
  const removed = expire(state, now); state.heartbeat = now;
  if (Object.values(state.jobs).some(j => j.status === 'running')) return { job: null, removed };
  for (const job of Object.values(state.jobs).filter(j => j.status === 'queued').sort((a,b) => a.createdAt - b.createdAt)) {
    // Recheck at execution time, including usage reported since this job queued.
    release(state, job);
    try { reserve(state, job, now); }
    catch (e) { job.status = 'failed'; job.error = e.code; job.finishedAt = now; job.accounted = true; continue; }
    job.status = 'running'; job.startedAt = now; job.deadline = now + 180000; job.lease = randomUUID();
    return { job, removed };
  }
  return { job: null, removed };
}
export function ownedJob(state, id, visitor) {
  const job = state.jobs[id]; if (!job || job.visitor !== visitor) throw new GatewayError('not_found', 404); return job;
}
export function cancel(state, id, visitor, now) {
  const job = ownedJob(state, id, visitor);
  if (job.status === 'queued') { release(state, job); job.status = 'cancelled'; job.finishedAt = now; job.accounted = true; }
  else if (job.status === 'running') job.cancelRequested = true;
  return job;
}
export function settle(state, id, lease, result, now) {
  const job = state.jobs[id]; if (!job || job.lease !== lease) throw new GatewayError('lease_invalid', 409);
  if (job.accounted) return job;
  const day = ledger(state, job.day);
  const usage = result.usage;
  if (usage && Number.isSafeInteger(usage.input) && Number.isSafeInteger(usage.output) && usage.input >= 0 && usage.output >= 0) {
    release(state, job); const total = usage.input + usage.output;
    day.used += total; for (const key of keys(job)) person(day, key).used += total;
    day.unknown = day.unknown.filter(x => x !== id); job.usage = usage; job.accounted = true;
  } else {
    release(state, job);
    if (!day.unknown.includes(id)) day.unknown.push(id);
    job.error = 'usage_unknown';
  }
  job.status = job.cancelRequested ? 'cancelled' : result.ok && job.accounted ? 'completed' : 'failed';
  if (!result.ok && !job.error) job.error = result.error || 'model_failed';
  job.finishedAt = now;
  return job;
}
export function publicJob(job) {
  return { id: job.id, status: job.status, error: job.error, usage: job.usage, createdAt: job.createdAt, cancelRequested: !!job.cancelRequested };
}

// One state record makes reservations, lease ownership, and settlement atomic.
export async function transaction(store, update) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const old = await store.getWithMetadata('state', { type: 'json', consistency: 'strong' });
    const state = old ? structuredClone(old.data) : freshState();
    const value = update(state);
    const response = await store.setJSON('state', state, old ? { onlyIfMatch: old.etag } : { onlyIfNew: true });
    if (response.modified && response.etag) return value;
    if (response.modified) throw new GatewayError('storage_unavailable', 503);
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 40));
  }
  throw new GatewayError('busy', 503);
}

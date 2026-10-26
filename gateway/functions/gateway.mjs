import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';
import { GatewayError, freshState, transaction, quota, submit, claim, settle, cancel, publicJob, ownedJob } from '../lib/queue.mjs';
import { issue, identify, equal } from '../lib/auth.mjs';
import { validateInput } from '../lib/input.mjs';

const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean));
const safeFetch = async (...args) => { const r = await fetch(...args); if (!r.ok && ![404,412].includes(r.status)) throw new GatewayError('storage_unavailable',503); return r; };
const store = name => getStore({ name, consistency: 'strong', fetch: safeFetch });
async function body(req, limit = 3 * 1024 * 1024) {
  const reader = req.body?.getReader(); if (!reader) throw new GatewayError('invalid_input');
  let size = 0; const chunks = [];
  while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new GatewayError('input_too_large',413); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new GatewayError('invalid_input'); }
}
export default async (req, context) => {
  const origin = req.headers.get('origin'), headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin', 'X-Content-Type-Options':'nosniff' };
  if (origin && allowedOrigins.has(origin)) Object.assign(headers, {'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Headers':'Authorization,Content-Type', 'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});
  const response = (data, status = 200) => new Response(JSON.stringify(data),{status,headers});
  try {
    if (origin && !allowedOrigins.has(origin)) throw new GatewayError('origin_denied',403);
    if (req.method === 'OPTIONS') return response({ok:true});
    if (!process.env.SESSION_SECRET || !process.env.WORKER_SECRET) throw new GatewayError('not_configured',503);
    const path = new URL(req.url).pathname.replace(/^\/api\/?/, '');
    const bearer = (req.headers.get('authorization') || '').replace(/^Bearer /,'');
    const stateStore = store('codex-state-v1'), payloadStore = store('codex-payloads-v1');
    const readState = async () => await stateStore.get('state',{type:'json'}) || freshState();
    if (path.startsWith('worker/')) {
      if (!equal(bearer, process.env.WORKER_SECRET)) throw new GatewayError('unauthorized',401);
      if (path === 'worker/claim' && req.method === 'POST') {
        const result = await transaction(stateStore, s => claim(s, Date.now()));
        // Bound retention even on idle days. Errors retry on the next sweep.
        for (const id of result.removed) await Promise.all([payloadStore.delete(`input/${id}`),payloadStore.delete(`result/${id}`)]);
        if (!result.job) return response({job:null});
        const input = await payloadStore.get(`input/${result.job.id}`,{type:'json'});
        return response({ job: result.job, input });
      }
      if (path === 'worker/heartbeat' && req.method === 'POST') {
        await transaction(stateStore,s => {s.heartbeat=Date.now();}); return response({ok:true});
      }
      const match = path.match(/^worker\/jobs\/([a-f0-9-]+)$/);
      if (match) {
        const data = await body(req, 200000), state = await readState(), job = state.jobs[match[1]];
        if (!job || !equal(job.lease, data.lease)) throw new GatewayError('lease_invalid',409);
        if (req.method === 'POST' && !data.result) return response({cancelRequested:!!job.cancelRequested});
        if (req.method === 'POST' && data.result) {
          const result = data.result;
          if (result.ok && (typeof result.code !== 'string' || result.code.length > 65536)) throw new GatewayError('invalid_result');
          if (!job.accounted && result.ok) await payloadStore.setJSON(`result/${job.id}`,{code:result.code});
          const done = await transaction(stateStore,s => settle(s,job.id,data.lease,result,Date.now()));
          await payloadStore.delete(`input/${job.id}`);
          return response({ok:true,status:done.status});
        }
      }
      throw new GatewayError('not_found',404);
    }
    if (path === 'session' && req.method === 'POST') return response({token:issue(process.env.SESSION_SECRET)});
    const identity = identify(bearer, context.ip, process.env.SESSION_SECRET);
    if (path === 'status' && req.method === 'GET') {
      const state = await readState();
      return response({quota:quota(state,identity,Date.now()),job:Object.values(state.jobs).filter(j=>j.visitor===identity.visitor && ['queued','running'].includes(j.status)).map(publicJob)[0] || null});
    }
    if (path === 'jobs' && req.method === 'POST') {
      const input = validateInput(await body(req)), id = randomUUID();
      await payloadStore.setJSON(`input/${id}`,input);
      try { const job=await transaction(stateStore,s=>submit(s,identity,Date.now(),id));return response({job:publicJob(job)},202); }
      catch(e) { await payloadStore.delete(`input/${id}`); throw e; }
    }
    const match = path.match(/^jobs\/([a-f0-9-]+)$/);
    if (match) {
      if (req.method === 'DELETE') return response({job:publicJob(await transaction(stateStore,s=>cancel(s,match[1],identity.visitor,Date.now())))});
      if (req.method === 'GET') {
        const state=await readState(),job=ownedJob(state,match[1],identity.visitor);
        const result=job.status==='completed'?await payloadStore.get(`result/${job.id}`,{type:'json'}):null;
        return response({job:publicJob(job),code:result?.code,quota:quota(state,identity,Date.now())});
      }
    }
    throw new GatewayError('not_found',404);
  } catch(e) { return response({error:e instanceof GatewayError?e.code:'service_unavailable'},e instanceof GatewayError?e.status:503); }
};
export const config = { path: '/api/*' };

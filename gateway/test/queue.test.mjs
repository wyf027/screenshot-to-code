import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, GatewayError, freshState, submit, claim, settle, quota, cancel, dayKey } from '../lib/queue.mjs';

const identity = (visitor, ip = `${visitor}-ip`) => ({ visitor, ip });
const online = (state, now) => { state.heartbeat = now; };
function mustThrow(fn, code) { assert.throws(fn, error => error instanceof GatewayError && error.code === code); }

test('uses Beijing calendar days and exposes remaining quota', () => {
  assert.equal(dayKey(Date.parse('2026-10-26T15:59:59Z')), '2026-10-26');
  assert.equal(dayKey(Date.parse('2026-10-26T16:00:00Z')), '2026-10-27');
  const state = freshState(), now = Date.parse('2026-10-26T01:00:00Z'); online(state, now);
  const job = submit(state, identity('a'), now, 'job-a');
  assert.equal(quota(state, identity('a'), now).remaining, 0);
  assert.equal(job.reservation, LIMITS.visitor);
});

test('does not accept anonymous work when worker is offline', () => {
  const state = freshState(); mustThrow(() => submit(state, identity('a'), Date.now(), 'job-a'), 'worker_offline');
});

test('serially claims and settles real usage once', () => {
  const state = freshState(), now = Date.parse('2026-10-26T01:00:00Z'); online(state, now);
  submit(state, identity('a'), now, 'job-a');
  submit(state, identity('b'), now, 'job-b');
  const first = claim(state, now + 1000).job; assert.equal(first.id, 'job-a');
  assert.equal(claim(state, now + 1001).job, null);
  settle(state, first.id, first.lease, { ok: true, usage: { input: 1200, output: 800 } }, now + 2000);
  assert.equal(quota(state, identity('a'), now + 2000).used, 2000);
  const second = claim(state, now + 3000).job; assert.equal(second.id, 'job-b');
  settle(state, second.id, second.lease, { ok: false, error: 'model_failed', usage: { input: 50, output: 20 } }, now + 4000);
  assert.equal(quota(state, identity('b'), now + 4000).used, 70);
});

test('unknown usage blocks new work without pretending zero tokens', () => {
  const state = freshState(), now = Date.parse('2026-10-26T01:00:00Z'); online(state, now);
  submit(state, identity('a'), now, 'job-a'); const job = claim(state, now + 1).job;
  settle(state, job.id, job.lease, { ok: false, error: 'model_timeout' }, now + 2);
  assert.equal(quota(state, identity('a'), now + 2).unknownUsage, true);
  mustThrow(() => submit(state, identity('b'), now + 3, 'job-b'), 'usage_unknown');
});

test('only the owner can read or cancel a job and queued cancellation releases reservation', () => {
  const state = freshState(), now = Date.parse('2026-10-26T01:00:00Z'); online(state, now);
  submit(state, identity('a'), now, 'job-a');
  mustThrow(() => cancel(state, 'job-a', 'other', now + 1), 'not_found');
  cancel(state, 'job-a', 'a', now + 1);
  assert.equal(quota(state, identity('a'), now + 1).remaining, LIMITS.visitor);
});

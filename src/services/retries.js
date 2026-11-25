import { createHash } from 'node:crypto';
import { fail, Problem } from '../errors.js';
import { reconcile } from './expiry.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}

export function action(ctx, req, { operation, target = null, authorize, authorizeReplay, perform }) {
  const { db, clock } = ctx;
  const result = db.transaction(() => {
    const now = clock.now();
    reconcile(db, now);
    // A rejected action rolls back to this savepoint. Time reconciliation still commits.
    try {
      return db.transaction(() => {
        const resource = authorize?.();
        const key = req.get('Idempotency-Key');
        if (!key || key.length > 160 || !key.trim()) fail(400, 'invalid_key', 'Supply an Idempotency-Key of 1 to 160 characters.');
        const actor = req.actor.id;
        const fingerprint = createHash('sha256').update(JSON.stringify([
          req.method, operation, target, canonical(req.body ?? {})
        ])).digest('hex');
        const old = db.prepare('SELECT * FROM retries WHERE actor_id=? AND key=?').get(actor, key);
        if (old) {
          if (old.fingerprint !== fingerprint) fail(422, 'key_conflict', 'This action key was used for another request.');
          const body = JSON.parse(old.response);
          authorizeReplay?.(body);
          return { status: old.status, body };
        }
        const response = perform(now, resource);
        db.prepare('INSERT INTO retries VALUES (?,?,?,?,?)').run(actor, key, fingerprint, response.status, JSON.stringify(response.body));
        return response;
      })();
    } catch (error) {
      if (error instanceof Problem) return { error };
      throw error;
    }
  }).immediate();
  if (result.error) throw result.error;
  return result;
}

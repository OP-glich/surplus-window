import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { fail } from '../errors.js';

const digest = s => createHash('sha256').update(s).digest('hex');
const actorQuery = 'SELECT a.id,a.org_id,o.name,o.role FROM actors a JOIN organisations o ON a.org_id=o.id';

export function sessionRoutes({ db }) {
  const routes = Router();
  routes.get('/identities', (_req, res) => res.json(db.prepare(actorQuery + ' ORDER BY o.rowid').all()));
  routes.post('/session', (req, res) => {
    const id = req.body?.identity;
    const actor = typeof id === 'string' && db.prepare(actorQuery + ' WHERE a.id=?').get(id);
    if (!actor) fail(400, 'invalid_identity', 'Choose one of the seeded demo identities.');
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions VALUES (?,?)').run(digest(token), actor.id);
    res.status(201).json({ token, actor });
  });
  routes.use((req, _res, next) => {
    const token = /^Bearer ([\w-]+)$/.exec(req.get('Authorization') || '')?.[1];
    req.actor = token && db.prepare(actorQuery + ' JOIN sessions s ON s.actor_id=a.id WHERE s.token_hash=?').get(digest(token));
    if (!req.actor) fail(401, 'unauthorized', 'Sign in with a demo identity in this tab.');
    next();
  });
  routes.get('/session', (req, res) => res.json(req.actor));
  routes.delete('/session', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(req.get('Authorization').slice(7)));
    res.sendStatus(204);
  });
  return routes;
}
export const role = name => (req, _res, next) => {
  if (req.actor.role !== name) fail(403, 'forbidden', 'This action requires a ' + name + ' identity.');
  next();
};

import { Router } from 'express';
import { role } from './session.js';
import { listing, holdFor, reserve, settle } from '../services/inventory.js';
import { action } from '../services/retries.js';
import { reconciled } from '../services/expiry.js';
import { fail } from '../errors.js';

export function resourceId(raw) {
  const id = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id < 1) fail(404, 'not_found', 'Record not found.');
  return id;
}
export function reservationRoutes(ctx) {
  const { db, clock } = ctx;
  const routes = Router();
  routes.get('/reservations', role('kitchen'), (req, res) => {
    const records = reconciled(db, clock, () => db.prepare(`SELECT r.*,l.description,l.unit,l.address,l.pickup_end,o.name AS donor
      FROM reservations r JOIN listings l ON l.id=r.listing_id JOIN organisations o ON o.id=l.org_id
      WHERE r.org_id=? ORDER BY r.id DESC`).all(req.actor.org_id));
    res.json(records);
  });
  routes.post('/listings/:id/reservations', role('kitchen'), (req, res) => {
    const target = resourceId(req.params.id);
    const result = action(ctx, req, { operation:'reserve', target, authorize:() => listing(db, target),
      authorizeReplay:body => holdFor(db,req.actor,body.id),
      perform:(now, row) => reserve(db, req.actor, row, req.body ?? {}, now) });
    res.status(result.status).json(result.body);
  });
  for (const [operation, actorRole, state] of [['cancel','kitchen','CANCELLED'], ['handover','donor','COLLECTED']]) {
    routes.post('/reservations/:id/' + operation, role(actorRole), (req, res) => {
      const target = resourceId(req.params.id);
      const result = action(ctx, req, { operation, target, authorize:() => holdFor(db, req.actor, target),
        perform:(now, hold) => settle(db, req.actor, hold, state, now) });
      res.status(result.status).json(result.body);
    });
  }
  return routes;
}

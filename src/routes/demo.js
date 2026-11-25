import { Router } from 'express';
import { role } from './session.js';
import { listing, owns } from '../services/inventory.js';
import { resourceId } from './reservations.js';
import { reconcile } from '../services/expiry.js';

export function demoRoutes({ db, clock, demo }) {
  const routes = Router();
  if (!demo) return routes;
  routes.post('/demo/listings/:id/deadline', role('donor'), (req, res) => {
    const result = db.transaction(() => {
      const now = clock.now();
      const row = listing(db, resourceId(req.params.id));
      owns(req.actor, row.org_id);
      const next = Math.max(now, row.pickup_end);
      clock.advanceTo(next);
      reconcile(db, next);
      return { now:next };
    }).immediate();
    res.json(result);
  });
  return routes;
}

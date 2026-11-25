import { Router } from 'express';
import { role } from './session.js';
import { createListing, listing, owns } from '../services/inventory.js';
import { reconciled } from '../services/expiry.js';
import { action } from '../services/retries.js';

export function listingRoutes(ctx) {
  const routes = Router();
  const { db, clock } = ctx;
  routes.get('/listings', (req, res) => {
    res.json(reconciled(db, clock, now => {
      const donor = req.actor.role === 'donor';
      const where = donor ? 'l.org_id=?' : 'l.closed_at IS NULL AND l.pickup_start<=? AND ?<l.pickup_end';
      const listings = db.prepare(`SELECT l.*, o.name AS donor,
        COALESCE(SUM(CASE WHEN r.state='HELD' THEN r.quantity END),0) AS held,
        COALESCE(SUM(CASE WHEN r.state='COLLECTED' THEN r.quantity END),0) AS collected
        FROM listings l JOIN organisations o ON l.org_id=o.id LEFT JOIN reservations r ON r.listing_id=l.id
        WHERE ${where} GROUP BY l.id ORDER BY l.id DESC`).all(...(donor ? [req.actor.org_id] : [now, now]));
      if (donor) {
        for (const row of listings) {
          row.reservations = db.prepare(`SELECT r.*,o.name AS kitchen FROM reservations r JOIN organisations o ON o.id=r.org_id
            WHERE r.listing_id=? ORDER BY r.id`).all(row.id);
          row.events = db.prepare('SELECT * FROM inventory_events WHERE listing_id=? ORDER BY id').all(row.id);
        }
      }
      return { now, demo: ctx.demo, listings };
    }));
  });
  routes.post('/listings', role('donor'), (req, res) => {
    const result = action(ctx, req, { operation:'create',
      authorizeReplay:body => owns(req.actor, listing(db,body.id).org_id),
      perform:now => createListing(db, req.actor, req.body ?? {}, now) });
    res.status(result.status).json(result.body);
  });
  return routes;
}

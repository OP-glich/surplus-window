import { fail, positiveQuantity, validText } from '../errors.js';
import { record } from './events.js';
import { finishHold } from './expiry.js';

export function listing(db, id) {
  const row = db.prepare('SELECT * FROM listings WHERE id=?').get(id);
  if (!row) fail(404, 'not_found', 'Listing not found.');
  return row;
}
export function owns(actor, orgId) {
  if (actor.org_id !== orgId) fail(403, 'forbidden', 'This record belongs to another organisation.');
}
export function holdFor(db, actor, id) {
  const hold = db.prepare(`SELECT r.*, l.org_id AS donor FROM reservations r
    JOIN listings l ON l.id=r.listing_id WHERE r.id=?`).get(id);
  if (!hold) fail(404, 'not_found', 'Reservation not found.');
  owns(actor, actor.role === 'donor' ? hold.donor : hold.org_id);
  return hold;
}
export function createListing(db, actor, input, now, fixture = null) {
  const total = positiveQuantity(input.quantity);
  const description = validText(input.description, 'food description', 160);
  const unit = validText(input.unit, 'unit', 32);
  const address = validText(input.address, 'pickup address', 240);
  const { pickup_start: start, pickup_end: end } = input;
  const validTime = t => Number.isSafeInteger(t) && Math.abs(t) <= 8640000000000000;
  if (!validTime(start) || !validTime(end) || end <= start || end <= now)
    fail(400, 'invalid_window', 'Choose a deadline after both the start and the current time.');
  const { lastInsertRowid: id } = db.prepare(`INSERT INTO listings
    (fixture,org_id,description,unit,address,total,available,pickup_start,pickup_end)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(fixture, actor.org_id, description, unit, address, total, total, start, end);
  record(db, id, null, actor.id, 'LISTED', total, total, now);
  return { status: 201, body: { id, total, available: total } };
}
function assertOpen(row, now) {
  if (row.closed_at !== null || now >= row.pickup_end) fail(409, 'window_closed', 'The pickup window has closed.');
  if (now < row.pickup_start) fail(409, 'window_not_started', 'The pickup window has not started.');
}
export function reserve(db, actor, row, input, now) {
  const n = positiveQuantity(input.quantity);
  const changed = db.prepare(`UPDATE listings SET available=available-?
    WHERE id=? AND closed_at IS NULL AND pickup_start<=? AND ?<pickup_end AND available>=?`)
    .run(n, row.id, now, now, n).changes;
  if (!changed) {
    assertOpen(row, now);
    fail(409, 'insufficient_stock', 'There are too few portions available for that request.');
  }
  const expires = Math.min(now + 30 * 60_000, row.pickup_end);
  const { lastInsertRowid: id } = db.prepare(`INSERT INTO reservations
    (listing_id,org_id,quantity,state,created_at,expires_at,updated_at) VALUES (?,?,?,'HELD',?,?,?)`)
    .run(row.id, actor.org_id, n, now, expires, now);
  record(db, row.id, id, actor.id, 'HELD', n, -n, now);
  return { status: 201, body: { id, listing_id: row.id, quantity: n, state: 'HELD', expires_at: expires } };
}
export function settle(db, actor, hold, state, now) {
  if (hold.state === 'EXPIRED') fail(409, 'hold_expired', 'This hold has expired.');
  if (hold.state !== 'HELD') fail(409, 'hold_inactive', 'This reservation is already ' + hold.state.toLowerCase() + '.');
  assertOpen(listing(db, hold.listing_id), now);
  finishHold(db, hold, state, state === 'CANCELLED' ? hold.quantity : 0, actor.id, now);
  return { status: 200, body: { id: hold.id, quantity: hold.quantity, state } };
}

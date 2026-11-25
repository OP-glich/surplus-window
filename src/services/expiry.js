import { record } from './events.js';

export function finishHold(db, hold, state, delta, actor, now) {
  const changed = db.prepare("UPDATE reservations SET state=?, updated_at=? WHERE id=? AND state='HELD'")
    .run(state, now, hold.id).changes;
  if (!changed) return false;
  if (delta) db.prepare('UPDATE listings SET available=available+? WHERE id=?').run(delta, hold.listing_id);
  record(db, hold.listing_id, hold.id, actor, state, hold.quantity, delta, now);
  return true;
}

// Caller holds BEGIN IMMEDIATE. Closing takes precedence even after downtime.
export function reconcile(db, now) {
  const due = db.prepare('SELECT id,available FROM listings WHERE closed_at IS NULL AND pickup_end<=?').all(now);
  for (const listing of due) {
    const held = db.prepare("SELECT * FROM reservations WHERE listing_id=? AND state='HELD'").all(listing.id);
    let loss = listing.available;
    for (const hold of held) {
      finishHold(db, hold, 'EXPIRED', 0, null, now);
      loss += hold.quantity;
    }
    db.prepare('UPDATE listings SET available=0, written_off=?, closed_at=? WHERE id=?').run(loss, now, listing.id);
    record(db, listing.id, null, null, 'CLOSED', loss, -listing.available, now);
  }
  const expired = db.prepare("SELECT * FROM reservations WHERE state='HELD' AND expires_at<=?").all(now);
  for (const hold of expired) finishHold(db, hold, 'EXPIRED', hold.quantity, null, now);
}
export function reconciled(db, clock, read = () => {}) {
  return db.transaction(() => {
    const now = clock.now();
    reconcile(db, now);
    return read(now);
  }).immediate();
}

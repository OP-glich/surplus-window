export function record(db, listing, hold, actor, kind, quantity, delta, at) {
  db.prepare(`INSERT INTO inventory_events
    (listing_id,reservation_id,actor_id,kind,quantity,available_delta,at) VALUES (?,?,?,?,?,?,?)`)
    .run(listing, hold, actor, kind, quantity, delta, at);
}

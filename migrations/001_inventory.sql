CREATE TABLE organisations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('donor','kitchen'))
) STRICT;
CREATE TABLE actors (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organisations
) STRICT;
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES actors
) STRICT;
CREATE TABLE listings (
  id INTEGER PRIMARY KEY, fixture TEXT UNIQUE, org_id TEXT NOT NULL REFERENCES organisations,
  description TEXT NOT NULL, unit TEXT NOT NULL, address TEXT NOT NULL,
  total INTEGER NOT NULL CHECK(total BETWEEN 1 AND 9007199254740991),
  available INTEGER NOT NULL CHECK(available BETWEEN 0 AND total),
  written_off INTEGER NOT NULL DEFAULT 0 CHECK(written_off BETWEEN 0 AND total),
  pickup_start INTEGER NOT NULL, pickup_end INTEGER NOT NULL CHECK(pickup_end > pickup_start),
  closed_at INTEGER, CHECK(closed_at IS NULL OR (available=0 AND closed_at >= pickup_end))
) STRICT;
CREATE TABLE reservations (
  id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings,
  org_id TEXT NOT NULL REFERENCES organisations, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 9007199254740991),
  state TEXT NOT NULL CHECK(state IN ('HELD','COLLECTED','CANCELLED','EXPIRED')),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX holds_by_listing ON reservations(listing_id,state,expires_at);
CREATE INDEX due_listings ON listings(pickup_end) WHERE closed_at IS NULL;
CREATE INDEX due_holds ON reservations(expires_at) WHERE state='HELD';
CREATE TABLE inventory_events (
  id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings,
  reservation_id INTEGER REFERENCES reservations, actor_id TEXT REFERENCES actors,
  kind TEXT NOT NULL CHECK(kind IN ('LISTED','HELD','COLLECTED','CANCELLED','EXPIRED','CLOSED')),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 9007199254740991),
  available_delta INTEGER NOT NULL, at INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX one_close ON inventory_events(listing_id) WHERE kind='CLOSED';
CREATE UNIQUE INDEX one_terminal_event ON inventory_events(reservation_id)
  WHERE kind IN ('COLLECTED','CANCELLED','EXPIRED');
CREATE TABLE retries (
  actor_id TEXT NOT NULL REFERENCES actors, key TEXT NOT NULL, fingerprint TEXT NOT NULL,
  status INTEGER NOT NULL, response TEXT NOT NULL, PRIMARY KEY(actor_id,key)
) STRICT;
CREATE TABLE demo_clock (id INTEGER PRIMARY KEY CHECK(id=1), now_ms INTEGER NOT NULL) STRICT;

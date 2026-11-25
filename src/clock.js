export const wallClock = { now: () => Date.now() };

// Demo time moves only when the operator jumps. Opening the demo tomorrow is safe.
export function demoClock(db) {
  db.prepare('INSERT OR IGNORE INTO demo_clock VALUES (1, ?)').run(Date.now());
  const read = db.prepare('SELECT now_ms FROM demo_clock WHERE id=1');
  const move = db.prepare('UPDATE demo_clock SET now_ms=? WHERE id=1 AND now_ms < ?');
  return { now: () => read.get().now_ms, advanceTo: end => move.run(end, end) };
}

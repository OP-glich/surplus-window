import { createListing } from '../src/services/inventory.js';
export const people = [
  ['sunrise','Sunrise Bakery Demo','donor'], ['mill','West Mill Bakery Demo','donor'],
  ['kula','Kula Community Kitchen','kitchen'], ['hope','Hope Table Kitchen','kitchen'],
  ['eagle','Eagle Street Meals','kitchen']
];
export function seed(db, clock) {
  db.transaction(() => {
    for (const [id, name, role] of people) {
      db.prepare('INSERT OR IGNORE INTO organisations VALUES (?,?,?)').run(id, name, role);
      db.prepare('INSERT OR IGNORE INTO actors VALUES (?,?)').run(id, id);
    }
    if (db.prepare("SELECT 1 FROM listings WHERE fixture='sunrise-bread'").get()) return;
    const now = clock.now();
    createListing(db, { org_id:'sunrise', id:'sunrise' }, {
      description:'Mixed sourdough loaves', unit:'portions', quantity:20,
      address:'14 Market Lane, Windhoek (fictional)', pickup_start:now-60000, pickup_end:now+2*3600000
    }, now, 'sunrise-bread');
  }).immediate();
}

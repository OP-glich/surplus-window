import { databaseFile } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { demoClock } from '../src/clock.js';
import { seed } from './fixtures.js';

// Fixed destination. Rebuild only demo records, atomically, including its clock.
const db = openDatabase(databaseFile(true));
try {
  db.transaction(() => {
    for (const table of ['retries','inventory_events','reservations','sessions','listings','actors','organisations','demo_clock'])
      db.exec('DELETE FROM ' + table);
    seed(db, demoClock(db));
  }).immediate();
  console.log('Fresh 20-portion demo ready:', databaseFile(true));
} finally { db.close(); }

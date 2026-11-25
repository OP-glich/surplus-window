import { openDatabase } from '../src/database.js';
import { databaseFile } from '../src/config.js';
import { wallClock } from '../src/clock.js';
import { seed } from './fixtures.js';
import { pathToFileURL } from 'node:url';

export function setup(file = databaseFile(false), clock = wallClock) {
  const db = openDatabase(file);
  try { seed(db, clock); } finally { db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setup();
  console.log('Normal database ready:', databaseFile(false));
}

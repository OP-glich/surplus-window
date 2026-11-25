import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './config.js';

export function openDatabase(filename) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename, { timeout: 2500 });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE IF NOT EXISTS migrations (version TEXT PRIMARY KEY) STRICT');
    const directory = path.join(root, 'migrations');
    for (const name of readdirSync(directory).filter(s => /^\d+_.*\.sql$/.test(s)).sort()) {
      const sql = readFileSync(path.join(directory, name), 'utf8');
      db.transaction(() => {
        if (db.prepare('SELECT 1 FROM migrations WHERE version=?').get(name)) return;
        db.exec(sql);
        db.prepare('INSERT INTO migrations VALUES (?)').run(name);
      }).immediate();
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

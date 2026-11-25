import { openDatabase } from './database.js';
import { databaseFile } from './config.js';
import { demoClock, wallClock } from './clock.js';
import { seed } from '../scripts/fixtures.js';
import { createApp } from './app.js';
import { reconciled } from './services/expiry.js';
import { pathToFileURL } from 'node:url';

export async function startServer({ demo=false, file=databaseFile(demo), port=3000, clock:injected, sweepMs=3000 }={}) {
  const db = openDatabase(file);
  let server;
  try {
    const clock = injected ?? (demo ? demoClock(db) : wallClock);
    seed(db, clock);
    const app = createApp({ db, clock, demo });
    await new Promise((resolve,reject) => {
      server = app.listen(port, '127.0.0.1');
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const timer = setInterval(() => {
      try { reconciled(db, clock); } catch (error) { console.error('Inventory sweep failed:', error.message); }
    }, sweepMs);
    timer.unref();
    return { db, server, url:'http://127.0.0.1:' + server.address().port,
      async stop() {
        clearInterval(timer);
        await new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
        db.close();
      } };
  } catch (error) { db.close(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = process.argv.includes('--demo');
  const instance = await startServer({ demo, port:Number(process.env.PORT || 3000) });
  console.log('Surplus Window | ' + (demo ? 'demo clock' : 'live clock') + ' | ' + instance.url);
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => instance.stop().catch(console.error));
}

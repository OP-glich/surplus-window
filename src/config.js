import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const databaseFile = demo => path.join(root, 'data', demo ? 'demo.sqlite' : 'surplus.sqlite');

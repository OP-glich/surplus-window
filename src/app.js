import express from 'express';
import path from 'node:path';
import { root } from './config.js';
import { Problem } from './errors.js';
import { sessionRoutes } from './routes/session.js';
import { listingRoutes } from './routes/listings.js';
import { reservationRoutes } from './routes/reservations.js';
import { demoRoutes } from './routes/demo.js';
import { reconciled } from './services/expiry.js';

export function createApp(ctx) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req,res,next) => {
    res.set('X-Content-Type-Options','nosniff');
    res.set('Content-Security-Policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
  app.use('/api', (_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  app.use('/api', express.json({ limit:'16kb' }));
  app.get('/api/health', (_req,res) => {
    ctx.db.prepare('SELECT 1').get();
    res.json({ status:'ok', mode:ctx.demo ? 'demo' : 'normal' });
  });
  app.use('/api', sessionRoutes(ctx), listingRoutes(ctx), reservationRoutes(ctx), demoRoutes(ctx));
  app.use('/api', (_req,res) => res.status(404).json({ error:{ code:'not_found', message:'Endpoint not found.' } }));
  app.use(express.static(path.join(root,'public'), { extensions:['html'] }));
  app.use((err, _req, res, _next) => {
    let { status, code, message } = err;
    if (err.type === 'entity.parse.failed') [status,code,message] = [400,'invalid_json','Send a valid JSON body.'];
    else if (err.type === 'entity.too.large') [status,code,message] = [413,'body_too_large','Request body is too large.'];
    else if (err.code === 'SQLITE_BUSY') [status,code,message] = [503,'database_busy','The database is busy. Retry the same action.'];
    else if (!(err instanceof Problem)) {
      console.error(err);
      [status,code,message] = [500,'internal_error','The action could not be completed. Retry the same action.'];
    }
    res.status(status).json({ error:{ code, message } });
  });
  reconciled(ctx.db, ctx.clock);
  return app;
}

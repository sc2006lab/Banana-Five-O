import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { accountRouter } from './account/routes.js';
import { config } from './config.js';
import { loadSession } from './account/sessions.js';
import { errorHandler, HttpError } from './lib/http.js';
import { neighbourhoodRouter } from './neighbourhoods/routes.js';
import { preferencesRouter } from './preferences/routes.js';
import { shortlistRouter } from './shortlist/routes.js';
import { adminRouter } from './synchronisation/routes.js';
import { billingRouter, stripeWebhook } from './billing/routes.js';
import { workspaceRouter } from './workspaces/routes.js';

/** CSRF defence: state-changing API calls must be JSON (cross-site forms cannot send it without CORS preflight). */
function requireJsonForMutations(req: Request, _res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json'))
    return next(new HttpError(415, 'Requests that change data must be sent as JSON.'));
  next();
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.https ? 1 : 'loopback');
  if (config.https)
    app.use((req, res, next) => (req.secure ? next() : res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://www.onemap.gov.sg', 'https://*.onemap.gov.sg'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: config.https ? [] : null,
        },
      },
      strictTransportSecurity: config.https,
    }),
  );
  app.use(compression());
  // Stripe needs the raw body to verify signatures, so the webhook is mounted before the JSON parser.
  app.post('/api/billing/webhook', ...stripeWebhook);
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireJsonForMutations);
  api.use(loadSession);
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use(accountRouter);
  api.use(preferencesRouter);
  api.use(neighbourhoodRouter);
  api.use(shortlistRouter);
  api.use(workspaceRouter);
  api.use(billingRouter);
  api.use(adminRouter);
  api.use((_req, _res, next) => next(new HttpError(404, 'Unknown API endpoint.')));
  app.use('/api', api);

  // Serve the built React client (single deployable application).
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

import type { Request, Response } from 'express';
import { createApp } from '../server/src/app.js';
import { refreshServerlessIndex } from '../server/src/serverless.js';
import { sanitiseError } from '../server/src/lib/http.js';

const app = createApp();

// No listen(), node-cron or post-response data imports in a bounded function.
export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    await refreshServerlessIndex();
    return app(req, res);
  } catch (error) {
    console.error('[serverless]', sanitiseError(error));
    return res.status(503).json({ error: 'FamPlan is temporarily unavailable. Please try again shortly.' });
  }
}

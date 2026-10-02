import type { Request, Response } from 'express';
import { syncCloudSource, validCronAuthorization } from '../server/src/synchronisation/cloud.js';
import { sanitiseError } from '../server/src/lib/http.js';

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).setHeader('Allow', 'GET').end();
  if (!validCronAuthorization(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorised.' });
  const source = req.query.source;
  if (typeof source !== 'string') return res.status(400).json({ error: 'Select one configured source.' });
  try {
    const result = await syncCloudSource(source);
    return res.status(result.status).json({ source, outcome: result.outcome });
  } catch (error) {
    console.error('[cron]', sanitiseError(error));
    return res.status(503).json({ error: 'Scheduled refresh failed. The last validated data is retained.' });
  }
}

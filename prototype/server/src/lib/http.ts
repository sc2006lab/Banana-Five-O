import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Validate input and turn Zod issues into field-specific guidance (NFR-USAB-02, NFR-SEC-05). */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0] ?? 'Invalid input.';
  throw new HttpError(400, Object.keys(fields).length > 1 ? 'Please correct the highlighted fields.' : first, fields);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, fields: err.fields });
    return;
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body must be valid JSON.' });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }
  // Never echo internal details (may contain secrets); log a sanitised line only.
  console.error('[error]', err instanceof Error ? `${err.name}: ${err.message.slice(0, 300)}` : 'unknown error');
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

/** Strip anything that looks like a credential or token from error text before storing or displaying it. */
export function sanitiseError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/(token|password|secret|key|authorization|X-Amz-[A-Za-z-]+)=([^&\s"]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/https?:\/\/[^\s"]*\?[^\s"]*/g, (u) => u.split('?')[0] + '?[query redacted]')
    .slice(0, 400);
}

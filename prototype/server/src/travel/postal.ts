import { HttpError } from '../lib/http.js';

/** Normalise explicit Singapore postal inputs without converting them to numbers. */
export function postalCode(query: string): string | null {
  const q = query.trim();
  const match = /^(?:Singapore\s*|S\s*\(?\s*)?(\d{6})\s*\)?$/i.exec(q);
  if (match) return match[1];
  // A street such as "123 Bedok Road" is not a malformed postal code.
  if (/^\d+$/.test(q) || /^(?:Singapore\s*|S\s*\(?)\d+\s*\)?$/i.test(q))
    throw new HttpError(400, 'Enter a six-digit Singapore postal code, including any leading zero.', {
      q: 'Singapore postal codes contain exactly six digits.',
    });
  return null;
}

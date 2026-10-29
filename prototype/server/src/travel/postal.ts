import { HttpError } from '../lib/http.js';
import { singaporePostalInput } from '@famplan/shared';

/** Normalise explicit Singapore postal inputs without converting them to numbers. */
export function postalCode(query: string): string | null {
  const { postal, malformed } = singaporePostalInput(query);
  if (malformed)
    throw new HttpError(400, 'Enter a six-digit Singapore postal code, including any leading zero.', {
      q: 'Singapore postal codes contain exactly six digits.',
    });
  return postal;
}

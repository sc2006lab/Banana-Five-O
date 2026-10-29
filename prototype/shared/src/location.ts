/** Keep postal codes as strings and use identical validation in the browser and server. */
export function singaporePostalInput(query: string): { postal: string | null; malformed: boolean } {
  const q = query.trim();
  const match = /^(?:([0-9]{6})|Singapore\s*([0-9]{6})|S\s*([0-9]{6})|S\s*\(\s*([0-9]{6})\s*\))$/i.exec(q);
  if (match) return { postal: match.slice(1).find(Boolean)!, malformed: false };
  // Address/building names containing digits (e.g. 313@Somerset) remain text searches.
  return { postal: null, malformed: /^(?:(?:Singapore|S)\s*)?[\d\s()]+$/i.test(q) };
}

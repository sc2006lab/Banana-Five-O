// data.gov.sg client: dataset metadata + signed download URL with rate-limit backoff.
const META = 'https://api-production.data.gov.sg/v2/public/api/datasets';
const DOWNLOAD = 'https://api-open.data.gov.sg/v1/public/api/datasets';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': 'FamPlan/0.1 (NTU SC2006 student project)', ...(init.headers ?? {}) },
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs / 1000}s: ${url.split('?')[0]}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function getJsonWithRetry(url: string, attempts = 6): Promise<any> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetchWithTimeout(url);
    const body = await res.json().catch(() => null);
    if (res.status === 429 || body?.code === 24) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 11_000);
      continue;
    }
    if (!res.ok || !body) throw new Error(`data.gov.sg responded ${res.status} for ${url.split('?')[0]}`);
    if (body.code !== 0) throw new Error(`data.gov.sg error ${body.code}: ${String(body.errorMsg ?? '').slice(0, 120)}`);
    return body.data;
  }
  throw new Error('data.gov.sg rate limit persisted after retries');
}

export async function datasetMetadata(datasetId: string): Promise<{ name: string; lastUpdatedAt: Date | null }> {
  const d = await getJsonWithRetry(`${META}/${datasetId}/metadata`);
  return { name: d.name, lastUpdatedAt: d.lastUpdatedAt ? new Date(d.lastUpdatedAt) : null };
}

export async function downloadDataset(datasetId: string, options: { initiate?: boolean } = {}): Promise<string> {
  // CSV exports must be prepared first; geospatial files can be polled directly.
  // https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset
  if (options.initiate) await getJsonWithRetry(`${DOWNLOAD}/${datasetId}/initiate-download`);
  let d = await getJsonWithRetry(`${DOWNLOAD}/${datasetId}/poll-download`);
  for (let attempt = 0; !d?.url && attempt < 4; attempt++) {
    await sleep(12_000);
    d = await getJsonWithRetry(`${DOWNLOAD}/${datasetId}/poll-download`);
  }
  if (!d?.url) throw new Error(`data.gov.sg did not return a download URL for ${datasetId}`);
  const res = await fetchWithTimeout(d.url, {}, 120_000);
  if (!res.ok) throw new Error(`Dataset download failed with HTTP ${res.status}`);
  return res.text();
}

/** KML-derived GeoJSON stores attributes in an HTML table inside `Description`. */
export function parseKmlDescription(html: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!html) return out;
  const re = /<th>(.*?)<\/th>\s*<td>(.*?)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out[m[1].trim()] = decodeEntities(m[2].trim());
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, '');
}

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

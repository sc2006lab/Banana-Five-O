// Data Source Registry configuration (NFR-MAINT-01): each configured public source is an isolated adapter.
// Adding or replacing a source only touches this file.
import type { AmenityCategory } from '@famplan/shared';
import { checkSyncBudget, SyncBudgetError } from './budget.js';
import { isInSingapore, polygonAreaSqm } from '../lib/geo.js';
import { geocodeCached, OneMapAuthenticationError } from '../travel/onemap.js';
import { datasetMetadata, downloadDataset, fetchWithTimeout, parseCsv, parseKmlDescription } from './datagovsg.js';

export interface FacilityRecord {
  sourceRecordId: string;
  name: string;
  category: AmenityCategory;
  address: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
  details: Record<string, string>;
}

export interface BoundaryRecord {
  id: string;
  name: string;
  planningArea: string;
  region: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  areaSqm: number;
}

export interface FetchResult<T> {
  records: T[];
  publisherUpdatedAt: Date | null;
  coverageNote?: string;
}

interface BaseSource {
  id: string;
  name: string;
  provider: string;
  datasetName: string;
  licence: string;
  freshnessThresholdDays: number;
  /** Validation: minimum number of valid records for a candidate snapshot to be activated. */
  minRecords: number;
}

export interface FacilitySource extends BaseSource {
  kind: 'facility';
  categories: AmenityCategory[];
  fetch(): Promise<FetchResult<FacilityRecord>>;
}

export interface BoundarySource extends BaseSource {
  kind: 'boundary';
  categories: [];
  fetch(): Promise<FetchResult<BoundaryRecord>>;
}

export type SourceDefinition = FacilitySource | BoundarySource;

const SGOL = 'Singapore Open Data Licence v1.0';
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Pte|Ltd|Llp)\b\.?/g, (m) => m)
    .replace(/\bMrt\b/g, 'MRT')
    .replace(/\bLrt\b/g, 'LRT')
    .replace(/\bPcf\b/g, 'PCF')
    .replace(/\bMoe\b/g, 'MOE');

async function geojsonFromDataGov(datasetId: string) {
  const [meta, text] = await Promise.all([datasetMetadata(datasetId), downloadDataset(datasetId)]);
  const fc = JSON.parse(text) as GeoJSON.FeatureCollection;
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) throw new Error('Unexpected schema: not a GeoJSON FeatureCollection');
  return { meta, features: fc.features };
}

function point(f: GeoJSON.Feature): { lat: number; lng: number } | null {
  if (f.geometry?.type !== 'Point') return null;
  const [lng, lat] = f.geometry.coordinates;
  return isInSingapore(lat, lng) ? { lat, lng } : null;
}

const KINDERGARTEN_RE = /\bKINDERGARTEN\b/i;

// ───────────── Sources ─────────────

const uraSubzones: BoundarySource = {
  kind: 'boundary',
  id: 'ura-subzones',
  name: 'URA Master Plan 2019 Subzones',
  provider: 'Urban Redevelopment Authority via data.gov.sg',
  datasetName: 'Master Plan 2019 Subzone Boundary (No Sea)',
  licence: SGOL,
  freshnessThresholdDays: 31,
  minRecords: 300,
  categories: [],
  async fetch() {
    const { meta, features } = await geojsonFromDataGov('d_8594ae9ff96d0c708bc2af633048edfb');
    const records: BoundaryRecord[] = [];
    for (const f of features) {
      const p = f.properties ?? {};
      if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) continue;
      // Strip Z coordinates to keep payloads small.
      const strip = (ring: number[][]) => ring.map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))]);
      const geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon =
        f.geometry.type === 'Polygon'
          ? { type: 'Polygon', coordinates: f.geometry.coordinates.map(strip) }
          : { type: 'MultiPolygon', coordinates: f.geometry.coordinates.map((poly) => poly.map(strip)) };
      records.push({
        id: String(p.SUBZONE_C),
        name: titleCase(String(p.SUBZONE_N)),
        planningArea: titleCase(String(p.PLN_AREA_N)),
        region: titleCase(String(p.REGION_N)),
        geometry,
        areaSqm: polygonAreaSqm(geometry),
      });
    }
    return { records, publisherUpdatedAt: meta.lastUpdatedAt };
  },
};

const ecdaPreschools: FacilitySource = {
  kind: 'facility',
  id: 'ecda-preschools',
  name: 'ECDA Pre-Schools Location',
  provider: 'Early Childhood Development Agency via data.gov.sg',
  datasetName: 'Pre-Schools Location',
  licence: SGOL,
  freshnessThresholdDays: 31,
  minRecords: 1000,
  categories: ['childcare', 'kindergarten'],
  async fetch() {
    const { meta, features } = await geojsonFromDataGov('d_61eefab99958fd70e6aab17320a71f1c');
    const records: FacilityRecord[] = [];
    const seen = new Set<string>();
    for (const f of features) {
      const pt = point(f);
      const a = parseKmlDescription(f.properties?.Description);
      if (!pt || !a.CENTRE_NAME) continue;
      // A centre code can cover several services at one site (e.g. childcare + kindergarten), and the
      // publisher repeats some rows verbatim; key on the record CRC and skip exact repeats.
      const id = `${a.CENTRE_CODE}:${a.INC_CRC}`;
      if (seen.has(id)) continue;
      seen.add(id);
      records.push({
        sourceRecordId: id,
        name: titleCase(a.CENTRE_NAME),
        category: KINDERGARTEN_RE.test(a.CENTRE_NAME) ? 'kindergarten' : 'childcare',
        address: null,
        postalCode: null,
        ...pt,
        details: { 'Centre code': a.CENTRE_CODE ?? '' },
      });
    }
    return { records, publisherUpdatedAt: meta.lastUpdatedAt };
  },
};

const ecdaChildcare: FacilitySource = {
  kind: 'facility',
  id: 'ecda-childcare',
  name: 'ECDA Child Care Services',
  provider: 'Early Childhood Development Agency via data.gov.sg',
  datasetName: 'Child Care Services',
  licence: SGOL,
  freshnessThresholdDays: 31,
  minRecords: 800,
  categories: ['childcare', 'kindergarten'],
  async fetch() {
    const { meta, features } = await geojsonFromDataGov('d_5d668e3f544335f8028f546827b773b4');
    const records: FacilityRecord[] = [];
    for (const f of features) {
      const pt = point(f);
      const p = (f.properties ?? {}) as Record<string, string | null>;
      if (!pt || !p.NAME) continue;
      records.push({
        sourceRecordId: String(p.INC_CRC ?? p.OBJECTID),
        name: titleCase(p.NAME),
        category: KINDERGARTEN_RE.test(p.NAME) ? 'kindergarten' : 'childcare',
        address: p.ADDRESSSTREETNAME ? titleCase(p.ADDRESSSTREETNAME) : null,
        postalCode: p.ADDRESSPOSTALCODE ?? null,
        ...pt,
        details: {},
      });
    }
    return { records, publisherUpdatedAt: meta.lastUpdatedAt };
  },
};

const moeSchools: FacilitySource = {
  kind: 'facility',
  id: 'moe-schools',
  name: 'MOE General Information of Schools',
  provider: 'Ministry of Education via data.gov.sg; geocoded with OneMap',
  datasetName: 'General information of schools',
  licence: SGOL,
  freshnessThresholdDays: 31,
  minRecords: 250,
  categories: ['primary_school', 'secondary_school'],
  async fetch() {
    const [meta, text] = await Promise.all([
      datasetMetadata('d_688b934f82c1059ed0a6993d2a829089'),
      downloadDataset('d_688b934f82c1059ed0a6993d2a829089', { initiate: true }),
    ]);
    const rows = parseCsv(text);
    if (!rows.length || !('school_name' in rows[0]) || !('postal_code' in rows[0]))
      throw new Error('Unexpected schema: school_name/postal_code columns missing');
    const records: FacilityRecord[] = [];
    let ungeocoded = 0;
    let inScope = 0;
    for (const r of rows) {
      checkSyncBudget(20_000);
      const level = r.mainlevel_code.toUpperCase();
      const cats: AmenityCategory[] = [];
      if (level === 'PRIMARY' || level.includes('P1')) cats.push('primary_school');
      if (level.startsWith('SECONDARY') || level.includes('S1')) cats.push('secondary_school');
      if (!cats.length) continue; // JCs and centralised institutes are out of scope
      inScope++;
      const postal = r.postal_code.padStart(6, '0');
      const geo = await geocodeCached(`postal:${postal}`, postal).catch((error: unknown) => {
        if (error instanceof OneMapAuthenticationError || error instanceof SyncBudgetError) throw error;
        return null;
      });
      if (!geo) {
        ungeocoded++;
        continue;
      }
      const yes = (v: string) => v.toLowerCase() === 'yes';
      const programmes = [
        yes(r.sap_ind) && 'SAP',
        yes(r.autonomous_ind) && 'Autonomous',
        yes(r.gifted_ind) && 'Gifted Education Programme',
        yes(r.ip_ind) && 'Integrated Programme',
      ].filter(Boolean) as string[];
      for (const category of cats)
        records.push({
          sourceRecordId: `${postal}:${category}`,
          name: titleCase(r.school_name),
          category,
          address: `${titleCase(r.address)} Singapore ${postal}`,
          postalCode: postal,
          lat: geo.lat,
          lng: geo.lng,
          details: {
            Type: titleCase(r.type_code),
            Nature: titleCase(r.nature_code),
            Session: titleCase(r.session_code),
            ...(programmes.length ? { Programmes: programmes.join(', ') } : {}),
            ...(r.url_address && r.url_address !== 'na' ? { Website: r.url_address } : {}),
            ...(r.mrt_desc && r.mrt_desc !== 'na' ? { 'Nearby MRT': r.mrt_desc } : {}),
          },
        });
    }
    return {
      records,
      publisherUpdatedAt: meta.lastUpdatedAt,
      coverageNote: ungeocoded ? `${ungeocoded} of ${inScope} schools could not be geocoded and are excluded.` : undefined,
    };
  },
};

const osmSupermarkets: FacilitySource = {
  kind: 'facility',
  id: 'osm-supermarkets',
  name: 'OpenStreetMap Supermarkets',
  provider: 'OpenStreetMap contributors via Overpass API',
  datasetName: 'shop=supermarket within Singapore',
  licence: 'Open Database Licence (ODbL) 1.0 — © OpenStreetMap contributors',
  freshnessThresholdDays: 31,
  minRecords: 300,
  categories: ['supermarket'],
  async fetch() {
    const q =
      '[out:json][timeout:60];(node["shop"="supermarket"](1.15,103.59,1.48,104.1);way["shop"="supermarket"](1.15,103.59,1.48,104.1););out center tags;';
    const res = await fetchWithTimeout(
      'https://overpass-api.de/api/interpreter',
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: `data=${encodeURIComponent(q)}` },
      90_000,
    );
    if (!res.ok) throw new Error(`Overpass API responded ${res.status}`);
    const body = (await res.json()) as { osm3s?: { timestamp_osm_base?: string }; elements: any[] };
    const records: FacilityRecord[] = [];
    for (const e of body.elements ?? []) {
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      const t = e.tags ?? {};
      if (!isInSingapore(lat, lng)) continue;
      const name = [t.brand ?? t.name, t.branch].filter(Boolean).join(' — ') || t.name;
      if (!name) continue;
      const addr = [t['addr:housenumber'], t['addr:street'], t['addr:postcode'] && `Singapore ${t['addr:postcode']}`].filter(Boolean).join(' ');
      records.push({
        sourceRecordId: `${e.type}/${e.id}`,
        name,
        category: 'supermarket',
        address: addr || null,
        postalCode: t['addr:postcode'] ?? null,
        lat,
        lng,
        details: {
          ...(t.opening_hours ? { 'Opening hours': t.opening_hours } : {}),
          ...(t.wheelchair ? { 'Wheelchair access': t.wheelchair } : {}),
        },
      });
    }
    return { records, publisherUpdatedAt: body.osm3s?.timestamp_osm_base ? new Date(body.osm3s.timestamp_osm_base) : null };
  },
};

const mohChasClinics: FacilitySource = {
  kind: 'facility',
  id: 'moh-chas-clinics',
  name: 'MOH CHAS Clinics',
  provider: 'Ministry of Health via data.gov.sg',
  datasetName: 'CHAS Clinics',
  licence: SGOL,
  freshnessThresholdDays: 31,
  minRecords: 800,
  categories: ['clinic'],
  async fetch() {
    const { meta, features } = await geojsonFromDataGov('d_548c33ea2d99e29ec63a7cc9edcccedc');
    const records: FacilityRecord[] = [];
    for (const f of features) {
      const pt = point(f);
      const a = parseKmlDescription(f.properties?.Description);
      if (!pt || !a.HCI_NAME) continue;
      const unit = a.FLOOR_NO && a.UNIT_NO ? `#${a.FLOOR_NO}-${a.UNIT_NO}` : '';
      const address = [a.BLK_HSE_NO, a.STREET_NAME && titleCase(a.STREET_NAME), unit, a.BUILDING_NAME && titleCase(a.BUILDING_NAME), a.POSTAL_CD && `Singapore ${a.POSTAL_CD}`]
        .filter(Boolean)
        .join(' ');
      records.push({
        sourceRecordId: a.HCI_CODE || a.INC_CRC,
        name: titleCase(a.HCI_NAME),
        category: 'clinic',
        address: address || null,
        postalCode: a.POSTAL_CD ?? null,
        ...pt,
        details: {
          ...(a.CLINIC_PROGRAMME_CODE ? { Programmes: a.CLINIC_PROGRAMME_CODE.replace(/,/g, ', ') } : {}),
          ...(a.HCI_TEL ? { Telephone: a.HCI_TEL } : {}),
        },
      });
    }
    return { records, publisherUpdatedAt: meta.lastUpdatedAt };
  },
};

const parkSuffix: Record<string, string> = { PG: 'Playground', PK: 'Park', OS: 'Open Space', FC: 'Fitness Corner', GDN: 'Garden' };

const nparksParks: FacilitySource = {
  kind: 'facility',
  id: 'nparks-parks',
  name: 'NParks Parks',
  provider: 'National Parks Board via data.gov.sg',
  datasetName: 'Parks',
  licence: SGOL,
  freshnessThresholdDays: 31,
  minRecords: 300,
  categories: ['park_playground'],
  async fetch() {
    const { meta, features } = await geojsonFromDataGov('d_0542d48f0991541706b58059381a6eca');
    const records: FacilityRecord[] = [];
    for (const f of features) {
      const pt = point(f);
      const p = (f.properties ?? {}) as Record<string, string>;
      if (!pt || !p.NAME) continue;
      const name = titleCase(p.NAME.replace(/\b(PG|PK|OS|FC|GDN)\b(\s+[IVX]+)?$/, (_m, s: string, n?: string) => parkSuffix[s] + (n ?? '')))
        .replace(/\bJln\b/g, 'Jalan')
        .replace(/\bRd\b/g, 'Road')
        .replace(/\bAve\b/g, 'Avenue')
        .replace(/\bDr\b/g, 'Drive')
        .replace(/\bSt\b(?!\.)/g, 'Street')
        .replace(/\b(Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());
      records.push({
        sourceRecordId: String(p.INC_CRC ?? p.OBJECTID),
        name,
        category: 'park_playground',
        address: null,
        postalCode: null,
        ...pt,
        details: {},
      });
    }
    return { records, publisherUpdatedAt: meta.lastUpdatedAt };
  },
};

const ltaMrt: FacilitySource = {
  kind: 'facility',
  id: 'lta-mrt-exits',
  name: 'LTA MRT Station Exits',
  provider: 'Land Transport Authority via data.gov.sg',
  datasetName: 'LTA MRT Station Exit (GEOJSON)',
  licence: SGOL,
  freshnessThresholdDays: 31,
  minRecords: 100,
  categories: ['mrt'],
  async fetch() {
    const { meta, features } = await geojsonFromDataGov('d_b39d3a0871985372d7e1637193335da5');
    const stations = new Map<string, { lat: number; lng: number }[]>();
    for (const f of features) {
      const pt = point(f);
      const n = String(f.properties?.STATION_NA ?? '').trim();
      if (!pt || !n) continue;
      stations.set(n, [...(stations.get(n) ?? []), pt]);
    }
    // One facility per station, located at the mean of its exits (documented basis).
    const records: FacilityRecord[] = [...stations.entries()].map(([n, exits]) => ({
      sourceRecordId: n,
      name: titleCase(n),
      category: 'mrt' as const,
      address: null,
      postalCode: null,
      lat: exits.reduce((s, e) => s + e.lat, 0) / exits.length,
      lng: exits.reduce((s, e) => s + e.lng, 0) / exits.length,
      details: { Exits: String(exits.length), 'Location basis': 'Mean position of station exits' },
    }));
    return { records, publisherUpdatedAt: meta.lastUpdatedAt };
  },
};

const ltaBusStops: FacilitySource = {
  kind: 'facility',
  id: 'lta-bus-stops',
  name: 'LTA Bus Stops',
  provider: 'Land Transport Authority via data.gov.sg',
  datasetName: 'LTA Bus Stop',
  licence: SGOL,
  freshnessThresholdDays: 31,
  minRecords: 4000,
  categories: ['bus_stop'],
  async fetch() {
    const { meta, features } = await geojsonFromDataGov('d_3f172c6feb3f4f92a2f47d93eed2908a');
    const records: FacilityRecord[] = [];
    for (const f of features) {
      const pt = point(f);
      const num = String(f.properties?.BUS_STOP_NUM ?? '').trim();
      if (!pt || !num) continue;
      records.push({
        sourceRecordId: num,
        name: `Bus stop ${num}`,
        category: 'bus_stop',
        address: null,
        postalCode: null,
        ...pt,
        details: {},
      });
    }
    return { records, publisherUpdatedAt: meta.lastUpdatedAt };
  },
};

/** Boundary source first so neighbourhoods exist before facility aggregation. */
export const SOURCES: SourceDefinition[] = [
  uraSubzones,
  ecdaPreschools,
  ecdaChildcare,
  moeSchools,
  osmSupermarkets,
  mohChasClinics,
  nparksParks,
  ltaMrt,
  ltaBusStops,
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);

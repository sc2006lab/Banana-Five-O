// NFR-MAINT-02 (external-data transformation), NFR-DATA-04, FR-RES-01: each source adapter turns the provider's
// raw payload into FacilityRecord / BoundaryRecord rows. Network calls are replaced with fixed payloads; the
// parsing and transformation code runs for real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/synchronisation/datagovsg.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/synchronisation/datagovsg.js')>()),
  datasetMetadata: vi.fn(),
  downloadDataset: vi.fn(),
  fetchWithTimeout: vi.fn(),
}));
vi.mock('../src/travel/onemap.js', () => ({ geocodeCached: vi.fn() }));

import { datasetMetadata, downloadDataset, fetchWithTimeout } from '../src/synchronisation/datagovsg.js';
import { geocodeCached } from '../src/travel/onemap.js';
import { sourceById, type BoundaryRecord, type FacilityRecord } from '../src/synchronisation/sources.js';

const UPDATED = new Date('2026-09-01T00:00:00Z');
const IN_SG: [number, number] = [103.8, 1.35]; // [lng, lat]
const OUTSIDE: [number, number] = [0, 0];

const featureCollection = (features: object[]) => JSON.stringify({ type: 'FeatureCollection', features });
const pointFeature = (coords: [number, number], properties: object) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties });
const kml = (attrs: Record<string, string>) =>
  `<center><table>${Object.entries(attrs).map(([k, v]) => `<tr><th>${k}</th> <td>${v}</td></tr>`).join('')}</table></center>`;

function serve(payload: string) {
  vi.mocked(datasetMetadata).mockResolvedValue({ name: 'fixture', lastUpdatedAt: UPDATED });
  vi.mocked(downloadDataset).mockResolvedValue(payload);
}
const facilities = async (id: string) => (await sourceById(id)!.fetch()) as { records: FacilityRecord[]; publisherUpdatedAt: Date | null; coverageNote?: string };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ura-subzones adapter', () => {
  it('keeps Polygon and MultiPolygon subzones, strips Z values and title-cases names', async () => {
    serve(
      featureCollection([
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[103.8, 1.3, 0], [103.81, 1.3, 0], [103.81, 1.31, 0], [103.8000001234, 1.3, 0]]] },
          properties: { SUBZONE_C: 'TMSZ01', SUBZONE_N: 'TAMPINES EAST', PLN_AREA_N: 'TAMPINES', REGION_N: 'EAST REGION' },
        },
        {
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [[[[103.9, 1.4], [103.91, 1.4], [103.91, 1.41], [103.9, 1.4]]]] },
          properties: { SUBZONE_C: 'PGSZ02', SUBZONE_N: 'PUNGGOL FIELD', PLN_AREA_N: 'PUNGGOL', REGION_N: 'NORTH-EAST REGION' },
        },
        pointFeature(IN_SG, { SUBZONE_C: 'XX' }),
        { type: 'Feature', geometry: null, properties: { SUBZONE_C: 'YY' } },
      ]),
    );
    const { records, publisherUpdatedAt } = (await sourceById('ura-subzones')!.fetch()) as { records: BoundaryRecord[]; publisherUpdatedAt: Date };
    expect(records.map((r) => r.id)).toEqual(['TMSZ01', 'PGSZ02']);
    expect(records[0]).toMatchObject({ name: 'Tampines East', planningArea: 'Tampines', region: 'East Region' });
    expect((records[0].geometry as GeoJSON.Polygon).coordinates[0][0]).toEqual([103.8, 1.3]);
    expect((records[0].geometry as GeoJSON.Polygon).coordinates[0][3]).toEqual([103.8, 1.3]); // rounded to 6 dp
    expect(records[1].geometry.type).toBe('MultiPolygon');
    expect(records[0].areaSqm).toBeGreaterThan(0);
    expect(publisherUpdatedAt).toEqual(UPDATED);
  });

  it('rejects a payload that is not a GeoJSON FeatureCollection', async () => {
    serve(JSON.stringify({ type: 'Feature' }));
    await expect(sourceById('ura-subzones')!.fetch()).rejects.toThrow(/not a GeoJSON FeatureCollection/);
  });
});

describe('ecda-preschools adapter', () => {
  it('classifies kindergartens, skips repeats, points outside Singapore and nameless rows', async () => {
    serve(
      featureCollection([
        pointFeature(IN_SG, { Description: kml({ CENTRE_NAME: 'LITTLE STARS CHILDCARE PTE LTD', CENTRE_CODE: 'PT001', INC_CRC: 'A1' }) }),
        pointFeature(IN_SG, { Description: kml({ CENTRE_NAME: 'PCF SPARKLETOTS KINDERGARTEN', CENTRE_CODE: 'PT002', INC_CRC: 'B2' }) }),
        pointFeature(IN_SG, { Description: kml({ CENTRE_NAME: 'LITTLE STARS CHILDCARE PTE LTD', CENTRE_CODE: 'PT001', INC_CRC: 'A1' }) }),
        pointFeature(OUTSIDE, { Description: kml({ CENTRE_NAME: 'FAR AWAY', CENTRE_CODE: 'PT003', INC_CRC: 'C3' }) }),
        pointFeature(IN_SG, { Description: kml({ CENTRE_CODE: 'PT004', INC_CRC: 'D4' }) }),
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [IN_SG, IN_SG] }, properties: { Description: kml({ CENTRE_NAME: 'LINE' }) } },
      ]),
    );
    const { records } = await facilities('ecda-preschools');
    expect(records.map((r) => [r.sourceRecordId, r.name, r.category])).toEqual([
      ['PT001:A1', 'Little Stars Childcare Pte Ltd', 'childcare'],
      ['PT002:B2', 'PCF Sparkletots Kindergarten', 'kindergarten'],
    ]);
    expect(records[0]).toMatchObject({ lat: 1.35, lng: 103.8, address: null, details: { 'Centre code': 'PT001' } });
  });
});

describe('ecda-childcare adapter', () => {
  it('maps name, address and postal code, falling back to OBJECTID when INC_CRC is absent', async () => {
    serve(
      featureCollection([
        pointFeature(IN_SG, { NAME: 'MY FIRST SKOOL', INC_CRC: 'X9', ADDRESSSTREETNAME: 'TAMPINES STREET 81', ADDRESSPOSTALCODE: '520881' }),
        pointFeature(IN_SG, { NAME: 'BRIGHT KINDERGARTEN', OBJECTID: 42 }),
        pointFeature(IN_SG, { INC_CRC: 'NO-NAME' }),
        { type: 'Feature', geometry: { type: 'Point', coordinates: IN_SG } },
      ]),
    );
    const { records } = await facilities('ecda-childcare');
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ sourceRecordId: 'X9', name: 'My First Skool', category: 'childcare', address: 'Tampines Street 81', postalCode: '520881' });
    expect(records[1]).toMatchObject({ sourceRecordId: '42', category: 'kindergarten', address: null, postalCode: null });
  });
});

describe('moe-schools adapter', () => {
  const header = 'school_name,address,postal_code,mainlevel_code,type_code,nature_code,session_code,sap_ind,autonomous_ind,gifted_ind,ip_ind,url_address,mrt_desc';
  const csv = (...rows: string[]) => [header, ...rows].join('\n');

  it('derives primary/secondary categories, programmes and details; excludes out-of-scope and ungeocoded schools', async () => {
    serve(
      csv(
        'ADMIRALTY PRIMARY SCHOOL,11 WOODLANDS CIRCLE,738907,PRIMARY,GOVERNMENT SCHOOL,CO-ED SCHOOL,FULL DAY,No,No,No,No,http://admiraltypri.moe.edu.sg,ADMIRALTY MRT',
        'RAFFLES INSTITUTION,1 RAFFLES INSTITUTION LANE,575954,MIXED LEVEL (S1-JC2),INDEPENDENT SCHOOL,BOYS SCHOOL,FULL DAY,No,No,Yes,Yes,na,na',
        'ANDERSON SERANGOON JC,4500 ANG MO KIO AVENUE 6,569843,JUNIOR COLLEGE,GOVERNMENT SCHOOL,CO-ED SCHOOL,FULL DAY,No,No,No,No,na,na',
        'LOST PRIMARY SCHOOL,1 NOWHERE ROAD,12345,PRIMARY,GOVERNMENT SCHOOL,CO-ED SCHOOL,FULL DAY,No,No,No,No,na,na',
      ),
    );
    vi.mocked(geocodeCached).mockImplementation(async (_key, postal) => (postal === '012345' ? null : { lat: 1.4, lng: 103.8, address: '' }));
    const { records, coverageNote } = await facilities('moe-schools');
    expect(records.map((r) => [r.sourceRecordId, r.category])).toEqual([
      ['738907:primary_school', 'primary_school'],
      ['575954:secondary_school', 'secondary_school'],
    ]);
    expect(records[0]).toMatchObject({
      name: 'Admiralty Primary School',
      address: '11 Woodlands Circle Singapore 738907',
      details: { Type: 'Government School', Website: 'http://admiraltypri.moe.edu.sg', 'Nearby MRT': 'ADMIRALTY MRT' }, // passed through unchanged
    });
    expect(records[0].details.Programmes).toBeUndefined();
    expect(records[1].details).toMatchObject({ Programmes: 'Gifted Education Programme, Integrated Programme' });
    expect(records[1].details.Website).toBeUndefined();
    expect(vi.mocked(geocodeCached)).toHaveBeenCalledWith('postal:012345', '012345'); // postal code padded to 6 digits
    expect(coverageNote).toBe('1 of 3 schools could not be geocoded and are excluded.');
  });

  it('omits the coverage note when every school is geocoded', async () => {
    serve(csv('ADMIRALTY PRIMARY SCHOOL,11 WOODLANDS CIRCLE,738907,PRIMARY,GOVERNMENT SCHOOL,CO-ED SCHOOL,FULL DAY,Yes,Yes,No,No,na,na'));
    vi.mocked(geocodeCached).mockResolvedValue({ lat: 1.4, lng: 103.8, address: '' });
    const { records, coverageNote } = await facilities('moe-schools');
    expect(records[0].details.Programmes).toBe('SAP, Autonomous');
    expect(coverageNote).toBeUndefined();
  });

  it('rejects a CSV without the expected columns', async () => {
    serve('name,postcode\nX,123456');
    await expect(sourceById('moe-schools')!.fetch()).rejects.toThrow(/school_name\/postal_code columns missing/);
  });
});

describe('osm-supermarkets adapter', () => {
  const respond = (ok: boolean, body: object, status = 200) =>
    vi.mocked(fetchWithTimeout).mockResolvedValue({ ok, status, json: async () => body } as Response);

  it('builds names from brand and branch, uses way centres, and skips nameless or out-of-area elements', async () => {
    respond(true, {
      osm3s: { timestamp_osm_base: '2026-10-01T00:00:00Z' },
      elements: [
        { type: 'node', id: 1, lat: 1.35, lon: 103.94, tags: { brand: 'FairPrice', branch: 'Tampines', 'addr:housenumber': '4', 'addr:street': 'Tampines Central 5', 'addr:postcode': '529510', opening_hours: '24/7', wheelchair: 'yes' } },
        { type: 'way', id: 2, center: { lat: 1.36, lon: 103.85 }, tags: { name: 'Sheng Siong' } },
        { type: 'node', id: 3, lat: 0, lon: 0, tags: { name: 'Elsewhere Mart' } },
        { type: 'node', id: 4, lat: 1.35, lon: 103.8, tags: {} },
        { type: 'node', id: 5, lat: 1.35, lon: 103.8 },
      ],
    });
    const { records, publisherUpdatedAt } = await facilities('osm-supermarkets');
    expect(records.map((r) => [r.sourceRecordId, r.name])).toEqual([
      ['node/1', 'FairPrice — Tampines'],
      ['way/2', 'Sheng Siong'],
    ]);
    expect(records[0]).toMatchObject({ address: '4 Tampines Central 5 Singapore 529510', postalCode: '529510', details: { 'Opening hours': '24/7', 'Wheelchair access': 'yes' } });
    expect(records[1]).toMatchObject({ lat: 1.36, lng: 103.85, address: null, postalCode: null, details: {} });
    expect(publisherUpdatedAt).toEqual(new Date('2026-10-01T00:00:00Z'));
  });

  it('reports no publisher time when Overpass omits it, and fails on an HTTP error', async () => {
    respond(true, { elements: [] });
    expect((await facilities('osm-supermarkets')).publisherUpdatedAt).toBeNull();
    respond(false, {}, 504);
    await expect(sourceById('osm-supermarkets')!.fetch()).rejects.toThrow('Overpass API responded 504');
  });
});

describe('moh-chas-clinics adapter', () => {
  it('assembles the address with unit number, spaces programme codes and falls back to INC_CRC', async () => {
    serve(
      featureCollection([
        pointFeature(IN_SG, {
          Description: kml({
            HCI_NAME: 'TAMPINES FAMILY CLINIC',
            HCI_CODE: 'CL001',
            BLK_HSE_NO: '201',
            STREET_NAME: 'TAMPINES STREET 21',
            FLOOR_NO: '01',
            UNIT_NO: '1103',
            BUILDING_NAME: 'TAMPINES MART',
            POSTAL_CD: '520201',
            CLINIC_PROGRAMME_CODE: 'CDMP,HSG',
            HCI_TEL: '67891234',
          }),
        }),
        pointFeature(IN_SG, { Description: kml({ HCI_NAME: 'MINIMAL CLINIC', INC_CRC: 'CRC7' }) }),
        pointFeature(IN_SG, { Description: kml({ HCI_CODE: 'CL009' }) }),
      ]),
    );
    const { records } = await facilities('moh-chas-clinics');
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      sourceRecordId: 'CL001',
      name: 'Tampines Family Clinic',
      address: '201 Tampines Street 21 #01-1103 Tampines Mart Singapore 520201',
      postalCode: '520201',
      details: { Programmes: 'CDMP, HSG', Telephone: '67891234' },
    });
    expect(records[1]).toMatchObject({ sourceRecordId: 'CRC7', address: null, postalCode: null, details: {} });
  });
});

describe('nparks-parks adapter', () => {
  it('expands park suffixes and street abbreviations in names', async () => {
    serve(
      featureCollection([
        pointFeature(IN_SG, { NAME: 'JLN BUKIT MERAH PG', INC_CRC: 'P1' }),
        pointFeature(IN_SG, { NAME: 'TAMPINES AVE 7 PK II', OBJECTID: 7 }),
        pointFeature(IN_SG, { NAME: 'ORCHARD RD OS' }),
        pointFeature(IN_SG, { INC_CRC: 'NO-NAME' }),
      ]),
    );
    const { records } = await facilities('nparks-parks');
    expect(records.map((r) => [r.sourceRecordId, r.name])).toEqual([
      ['P1', 'Jalan Bukit Merah Playground'],
      ['7', 'Tampines Avenue 7 Park II'],
      ['undefined', 'Orchard Road Open Space'],
    ]);
  });
});

describe('lta-mrt-exits adapter', () => {
  it('merges exits into one station located at their mean position', async () => {
    serve(
      featureCollection([
        pointFeature([103.94, 1.35], { STATION_NA: 'TAMPINES MRT STATION' }),
        pointFeature([103.96, 1.37], { STATION_NA: 'TAMPINES MRT STATION ' }),
        pointFeature([103.85, 1.3], { STATION_NA: 'BUGIS LRT STATION' }),
        pointFeature([103.85, 1.3], { STATION_NA: '' }),
      ]),
    );
    const { records } = await facilities('lta-mrt-exits');
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ sourceRecordId: 'TAMPINES MRT STATION', name: 'Tampines MRT Station', details: { Exits: '2' } });
    expect(records[0].lat).toBeCloseTo(1.36, 9);
    expect(records[0].lng).toBeCloseTo(103.95, 9);
    expect(records[1].name).toBe('Bugis LRT Station');
  });
});

describe('lta-bus-stops adapter', () => {
  it('names stops by number and skips rows without one', async () => {
    serve(featureCollection([pointFeature(IN_SG, { BUS_STOP_NUM: ' 75009 ' }), pointFeature(IN_SG, {}), pointFeature(OUTSIDE, { BUS_STOP_NUM: '1' })]));
    const { records } = await facilities('lta-bus-stops');
    expect(records.map((r) => [r.sourceRecordId, r.name, r.category])).toEqual([['75009', 'Bus stop 75009', 'bus_stop']]);
  });
});

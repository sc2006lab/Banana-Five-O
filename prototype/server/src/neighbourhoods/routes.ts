import { Router } from 'express';
import { z } from 'zod';
import {
  AMENITY_CATEGORIES,
  FAMILY_STAGES,
  PROXIMITY_RADII,
  compareQuerySchema,
  geocodeQuerySchema,
  routeQuerySchema,
  scoringParamsSchema,
  searchQuerySchema,
  type AreaDto,
  type ProximityRadius,
} from '@famplan/shared';
import { HttpError, parse } from '../lib/http.js';
import { SCORING_CONFIG, COMMUTE_MODEL } from '../scoring/config.js';
import { searchAddress } from '../travel/onemap.js';
import { routeEstimate } from '../travel/route.js';
import { index } from './store.js';
import { buildShowcase } from './showcase.js';
import { facilitiesNear, getNeighbourhood, neighbourhoodDetail, scoringContext, searchNeighbourhoods, summarise } from './service.js';

export const neighbourhoodRouter = Router();

neighbourhoodRouter.get('/meta', (_req, res) => {
  res.json({
    scoring: SCORING_CONFIG,
    commuteModel: COMMUTE_MODEL,
    radii: PROXIMITY_RADII,
    categories: AMENITY_CATEGORIES,
    stages: FAMILY_STAGES,
    datasetVersions: index.datasetVersions(),
    indexBuiltAt: index.builtAt.toISOString(),
  });
});

neighbourhoodRouter.get('/showcase', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(buildShowcase());
});

neighbourhoodRouter.get('/areas', (_req, res) => {
  const m = new Map<string, AreaDto>();
  for (const n of index.searchable) {
    const a = m.get(n.planningArea) ?? { planningArea: n.planningArea, region: n.region, neighbourhoods: 0 };
    a.neighbourhoods++;
    m.set(n.planningArea, a);
  }
  res.json([...m.values()].sort((a, b) => a.planningArea.localeCompare(b.planningArea)));
});

neighbourhoodRouter.get('/geocode', async (req, res) => {
  const { q } = parse(geocodeQuerySchema, req.query);
  try {
    res.json(await searchAddress(q));
  } catch {
    throw new HttpError(503, 'Address search (OneMap) is temporarily unavailable. Try again shortly.');
  }
});

neighbourhoodRouter.get('/neighbourhoods', async (req, res) => {
  const q = parse(searchQuerySchema, req.query);
  const ctx = scoringContext(q);
  res.json(
    await searchNeighbourhoods({
      ...ctx,
      q: q.q,
      areas: q.areas,
      stages: q.stages,
      category: q.category,
      minCount: q.minCount,
      maxNearest: q.maxNearest,
      maxCommute: q.maxCommute,
      sort: q.sort,
      order: q.order,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 12,
    }),
  );
});

/** All searchable neighbourhoods with coordinates, for map markers. */
neighbourhoodRouter.get('/neighbourhoods/points', (_req, res) => {
  res.json(index.searchable.map((n) => ({ id: n.id, name: n.name, planningArea: n.planningArea, lat: n.lat, lng: n.lng })));
});

neighbourhoodRouter.get('/neighbourhoods/:id', (req, res) => {
  const n = getNeighbourhood(String(req.params.id));
  res.json(neighbourhoodDetail(n, scoringContext(parse(scoringParamsSchema, req.query))));
});

const facilitiesQuery = z.object({
  radius: z.coerce.number().refine((r) => (PROXIMITY_RADII as readonly number[]).includes(r), 'Radius must be 500, 1000 or 2000.').default(1000),
  category: z.enum(AMENITY_CATEGORIES, 'Unknown amenity category.').optional(),
});

neighbourhoodRouter.get('/neighbourhoods/:id/facilities', (req, res) => {
  const n = getNeighbourhood(String(req.params.id));
  const q = parse(facilitiesQuery, req.query);
  res.json(facilitiesNear(n, q.radius as ProximityRadius, q.category));
});

neighbourhoodRouter.get('/neighbourhoods/:id/route', async (req, res) => {
  const n = getNeighbourhood(String(req.params.id));
  const q = parse(routeQuerySchema, req.query);
  res.json(await routeEstimate({ lat: n.lat, lng: n.lng }, { lat: q.destLat, lng: q.destLng }, q.mode, q.barrierFree));
});

neighbourhoodRouter.get('/compare', (req, res) => {
  const { ids } = parse(compareQuerySchema, req.query);
  const ctx = scoringContext(parse(scoringParamsSchema, req.query));
  const items = ids.map((id) => getNeighbourhood(id));
  res.json({
    radius: ctx.radius,
    items: items.map((n) => ({ ...summarise(n, ctx), detail: neighbourhoodDetail(n, ctx) })),
  });
});

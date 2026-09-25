// UC-2.1 Manage Family Preferences (FR-PREF-01 – FR-PREF-07).
import { Router } from 'express';
import { z } from 'zod';
import {
  CRITERIA,
  DEFAULT_WEIGHTS,
  FAMILY_STAGES,
  preferencesSchema,
  weightsSchema,
  type Criterion,
  type CriterionWeights,
  type PreferencesDto,
} from '@famplan/shared';
import type { FamilyPreferenceProfile, PriorityDestination } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError, parse } from '../lib/http.js';
import { index } from '../neighbourhoods/store.js';
import { requireUser } from '../account/sessions.js';
import { suggestWeights } from './presets.js';

const COLS: Record<Criterion, keyof FamilyPreferenceProfile> = {
  childcare: 'wChildcare',
  schools: 'wSchools',
  groceries: 'wGroceries',
  healthcare: 'wHealthcare',
  green_spaces: 'wGreenSpaces',
  public_transport: 'wPublicTransport',
  commute: 'wCommute',
  accessibility: 'wAccessibility',
};

export function toDto(p: (FamilyPreferenceProfile & { destinations: PriorityDestination[] }) | null): PreferencesDto {
  if (!p)
    return {
      familyStages: [],
      preferredAreas: [],
      amenityThresholds: {},
      weights: { ...DEFAULT_WEIGHTS },
      confirmedWeights: [],
      destinations: [],
      updatedAt: null,
    };
  return {
    familyStages: p.familyStages as PreferencesDto['familyStages'],
    preferredAreas: p.preferredAreas,
    amenityThresholds: p.amenityThresholds as PreferencesDto['amenityThresholds'],
    weights: Object.fromEntries(CRITERIA.map((c) => [c, p[COLS[c]] as number])) as CriterionWeights,
    confirmedWeights: p.confirmedWeights as Criterion[],
    destinations: [...p.destinations]
      .sort((a, b) => a.slot - b.slot)
      .map((d) => ({ label: d.label, queryText: d.queryText, address: d.address, lat: d.lat, lng: d.lng })),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function loadPreferences(accountId: string): Promise<PreferencesDto> {
  const p = await prisma.familyPreferenceProfile.findUnique({ where: { accountId }, include: { destinations: true } });
  return toDto(p);
}

export const preferencesRouter = Router();

preferencesRouter.get('/preferences', requireUser, async (req, res) => {
  res.json(await loadPreferences(req.user!.id));
});

preferencesRouter.put('/preferences', requireUser, async (req, res) => {
  const input = parse(preferencesSchema, req.body);
  const known = new Set(index.neighbourhoods.map((n) => n.planningArea.toUpperCase()));
  const fields: Record<string, string> = {};
  input.preferredAreas.forEach((a, i) => {
    if (known.size && !known.has(a.toUpperCase())) fields[`preferredAreas.${i}`] = `${a} is not a recognised planning area.`;
  });
  if (Object.keys(fields).length) throw new HttpError(400, Object.values(fields)[0], fields);
  const areaNames = input.preferredAreas.map(
    (a) => index.neighbourhoods.find((n) => n.planningArea.toUpperCase() === a.toUpperCase())?.planningArea ?? a,
  );
  const weightCols = Object.fromEntries(CRITERIA.map((c) => [COLS[c], input.weights[c]]));
  const accountId = req.user!.id;
  const data = {
    familyStages: input.familyStages,
    preferredAreas: areaNames,
    amenityThresholds: input.amenityThresholds,
    confirmedWeights: input.confirmedWeights,
    ...weightCols,
  };
  await prisma.$transaction([
    prisma.familyPreferenceProfile.upsert({ where: { accountId }, create: { accountId, ...data }, update: data }),
    prisma.priorityDestination.deleteMany({ where: { profileId: accountId } }),
    prisma.priorityDestination.createMany({
      data: input.destinations.map((d, i) => ({ profileId: accountId, slot: i + 1, ...d })),
    }),
  ]);
  res.json(await loadPreferences(accountId));
});

const suggestSchema = z.object({
  familyStages: z.array(z.enum(FAMILY_STAGES, 'Unknown family stage.')),
  weights: weightsSchema,
  confirmedWeights: z.array(z.enum(CRITERIA)),
});

/** Available to visitors too: suggestions are computed, not saved. */
preferencesRouter.post('/preferences/suggest-weights', (req, res) => {
  const input = parse(suggestSchema, req.body);
  res.json(suggestWeights(input.familyStages, input.weights, input.confirmedWeights));
});

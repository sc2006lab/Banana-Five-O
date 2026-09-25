// Zod schemas shared by client (form validation) and server (request validation) — NFR-SEC-05, NFR-USAB-02.
import { z } from 'zod';
import {
  AMENITY_CATEGORIES,
  CRITERIA,
  DESTINATIONS_MAX,
  FAMILY_STAGES,
  NOTE_MAX,
  PROXIMITY_RADII,
  SORT_OPTIONS,
  TRAVEL_MODES,
  WEIGHT_MAX,
  WEIGHT_MIN,
  type Criterion,
} from './domain.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(254, 'Email address is too long.')
  .pipe(z.email('Enter a valid email address, e.g. name@example.com.'));

/** Password policy: 10–128 characters with at least one letter and one digit. */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a display name.')
  .max(60, 'Display name must be at most 60 characters.')
  .regex(/^[^<>]*$/, 'Display name cannot contain < or >.');

export const registerSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  consent: z.literal(true, 'You must agree to the stated data use to create an account.'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, 'This reset link is invalid.'),
  password: passwordSchema,
});

export const updateAccountSchema = z.object({ displayName: displayNameSchema }).strict();

export const deleteAccountSchema = z.object({
  confirmation: z.literal('DELETE', 'Type DELETE to confirm account deletion.'),
});

export const weightSchema = z
  .number('Weight must be a number.')
  .int('Weight must be a whole number from 0 to 5.')
  .min(WEIGHT_MIN, 'Weight must be between 0 and 5.')
  .max(WEIGHT_MAX, 'Weight must be between 0 and 5.');

export const weightsSchema = z.object(
  Object.fromEntries(CRITERIA.map((c) => [c, weightSchema])) as Record<Criterion, typeof weightSchema>,
  'All eight criterion weights are required.',
);

const lat = z.number().min(1.1, 'Latitude is outside Singapore.').max(1.5, 'Latitude is outside Singapore.');
const lng = z.number().min(103.5, 'Longitude is outside Singapore.').max(104.2, 'Longitude is outside Singapore.');

export const destinationSchema = z.object({
  label: z.string().trim().min(1, 'Give the destination a label, e.g. Work.').max(40, 'Label must be at most 40 characters.'),
  queryText: z.string().trim().min(1, 'Enter an address or postal code.').max(200),
  address: z.string().trim().max(300),
  lat,
  lng,
});

export const preferencesSchema = z
  .object({
    familyStages: z.array(z.enum(FAMILY_STAGES, 'Unknown family stage.')).max(FAMILY_STAGES.length),
    preferredAreas: z.array(z.string().trim().min(1).max(60)).max(20, 'Choose at most 20 areas.'),
    amenityThresholds: z.partialRecord(
      z.enum(AMENITY_CATEGORIES, 'Unknown amenity category.'),
      z.union(
        PROXIMITY_RADII.map((r) => z.literal(r)) as unknown as [z.ZodLiteral<500>, z.ZodLiteral<1000>, z.ZodLiteral<2000>],
        'Distance must be 500 m, 1 km or 2 km.',
      ),
    ),
    weights: weightsSchema,
    confirmedWeights: z.array(z.enum(CRITERIA)).max(CRITERIA.length),
    destinations: z.array(destinationSchema).max(DESTINATIONS_MAX, `Save at most ${DESTINATIONS_MAX} priority destinations.`),
  })
  .superRefine((p, ctx) => {
    const seenAreas = new Set<string>();
    p.preferredAreas.forEach((a, i) => {
      const k = a.toUpperCase();
      if (seenAreas.has(k)) ctx.addIssue({ code: 'custom', path: ['preferredAreas', i], message: `${a} is already selected.` });
      seenAreas.add(k);
    });
    const seenDest = new Set<string>();
    p.destinations.forEach((d, i) => {
      const k = `${d.lat.toFixed(5)},${d.lng.toFixed(5)}`;
      if (seenDest.has(k)) ctx.addIssue({ code: 'custom', path: ['destinations', i, 'queryText'], message: 'This destination is already saved.' });
      seenDest.add(k);
    });
  });

export type PreferencesInput = z.infer<typeof preferencesSchema>;

const csv = <T extends z.ZodType>(item: T) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []))
    .pipe(z.array(item) as unknown as z.ZodType<z.output<T>[], string[]>);

const optionalInt = (msg: string) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s === undefined || s === '') return undefined;
      const n = Number(s);
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: msg });
        return z.NEVER;
      }
      return n;
    });

const optionalCoord = (min: number, max: number, msg: string) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s === undefined || s === '') return undefined;
      const n = Number(s);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: msg });
        return z.NEVER;
      }
      return n;
    });

const destLabel = z.string().trim().max(40, 'Destination label must be at most 40 characters.').optional();

/** Amenity thresholds as "category:radius,category:radius" (FR-PREF-04 applied to scoring). */
const thresholdsParam = z
  .string()
  .optional()
  .transform((s, ctx) => {
    const out: Partial<Record<(typeof AMENITY_CATEGORIES)[number], 500 | 1000 | 2000>> = {};
    if (!s) return out;
    for (const part of s.split(',')) {
      const [cat, r] = part.split(':');
      if (!(AMENITY_CATEGORIES as readonly string[]).includes(cat) || !['500', '1000', '2000'].includes(r)) {
        ctx.addIssue({ code: 'custom', message: `Amenity distance "${part}" must be category:500, 1000 or 2000.` });
        return z.NEVER;
      }
      out[cat as (typeof AMENITY_CATEGORIES)[number]] = Number(r) as 500 | 1000 | 2000;
    }
    return out;
  });

/** Weights may be passed as w_<criterion>=0..5 query params so visitors can score without saving. */
const weightParams = Object.fromEntries(
  CRITERIA.map((c) => [`w_${c}`, optionalInt(`Weight for ${c.replace('_', ' ')} must be a whole number from 0 to 5.`)]),
);

export const searchQuerySchema = z
  .object({
    q: z.string().trim().max(120, 'Search text must be at most 120 characters.').optional().default(''),
    areas: csv(z.string().min(1).max(60)),
    stages: csv(z.enum(FAMILY_STAGES, 'Unknown family stage.')),
    category: z.enum(AMENITY_CATEGORIES, 'Unknown amenity category.').optional(),
    minCount: optionalInt('Minimum facility count must be a whole number.'),
    maxNearest: optionalInt('Maximum nearest distance must be a whole number of metres.'),
    radius: optionalInt('Radius must be 500, 1000 or 2000.'),
    maxCommute: optionalInt('Commute threshold must be a whole number of minutes.'),
    destLat: optionalCoord(1.1, 1.5, 'Destination latitude is outside Singapore.'),
    destLng: optionalCoord(103.5, 104.2, 'Destination longitude is outside Singapore.'),
    destLabel: destLabel,
    th: thresholdsParam,
    sort: z.enum(SORT_OPTIONS, 'Sort must be score, nearest, commute or coverage.').optional().default('score'),
    order: z.enum(['asc', 'desc'], 'Order must be asc or desc.').optional(),
    page: optionalInt('Page must be a whole number.'),
    pageSize: optionalInt('Page size must be a whole number.'),
    ...weightParams,
  })
  .superRefine((q, ctx) => {
    const radius = q.radius ?? 1000;
    if (!(PROXIMITY_RADII as readonly number[]).includes(radius))
      ctx.addIssue({ code: 'custom', path: ['radius'], message: 'Radius must be 500 m, 1 km or 2 km.' });
    if (q.minCount !== undefined && q.minCount < 0)
      ctx.addIssue({ code: 'custom', path: ['minCount'], message: 'Minimum facility count cannot be negative.' });
    if (q.minCount !== undefined && q.minCount > 500)
      ctx.addIssue({ code: 'custom', path: ['minCount'], message: 'Minimum facility count must be at most 500.' });
    if ((q.minCount !== undefined || q.maxNearest !== undefined) && !q.category)
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Choose an amenity category for the count or distance filter.' });
    if (q.maxNearest !== undefined && (q.maxNearest <= 0 || q.maxNearest > radius))
      ctx.addIssue({
        code: 'custom',
        path: ['maxNearest'],
        message: `Nearest-facility distance must be between 1 m and the selected ${radius} m radius.`,
      });
    if (q.maxCommute !== undefined && (q.maxCommute < 5 || q.maxCommute > 180))
      ctx.addIssue({ code: 'custom', path: ['maxCommute'], message: 'Commute threshold must be between 5 and 180 minutes.' });
    if (q.maxCommute !== undefined && (q.destLat === undefined || q.destLng === undefined))
      ctx.addIssue({ code: 'custom', path: ['maxCommute'], message: 'Add a priority destination before filtering by commute time.' });
    if ((q.destLat === undefined) !== (q.destLng === undefined))
      ctx.addIssue({ code: 'custom', path: ['destLat'], message: 'Destination needs both latitude and longitude.' });
    if (q.sort === 'nearest' && !q.category)
      ctx.addIssue({ code: 'custom', path: ['sort'], message: 'Choose an amenity category to sort by nearest amenity.' });
    if (q.sort === 'commute' && q.destLat === undefined)
      ctx.addIssue({ code: 'custom', path: ['sort'], message: 'Add a priority destination to sort by commute time.' });
    if (q.page !== undefined && q.page < 1) ctx.addIssue({ code: 'custom', path: ['page'], message: 'Page must be 1 or more.' });
    if (q.pageSize !== undefined && (q.pageSize < 1 || q.pageSize > 50))
      ctx.addIssue({ code: 'custom', path: ['pageSize'], message: 'Page size must be between 1 and 50.' });
    for (const c of CRITERIA) {
      const v = (q as Record<string, unknown>)[`w_${c}`];
      if (typeof v === 'number' && (v < WEIGHT_MIN || v > WEIGHT_MAX))
        ctx.addIssue({ code: 'custom', path: [`w_${c}`], message: `Weight for ${c.replace('_', ' ')} must be between 0 and 5.` });
    }
  });

export type SearchQueryInput = z.input<typeof searchQuerySchema>;

export const routeQuerySchema = z.object({
  destLat: z.coerce.number('Destination latitude is required.').min(1.1).max(1.5),
  destLng: z.coerce.number('Destination longitude is required.').min(103.5).max(104.2),
  mode: z.enum(TRAVEL_MODES, 'Travel mode must be one of: pt, walk, drive, cycle.').default('pt'),
  barrierFree: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const noteSchema = z.object({
  text: z.string().max(NOTE_MAX, `Notes must be at most ${NOTE_MAX} characters.`),
});

export const shortlistAddSchema = z.object({
  neighbourhoodId: z.string().regex(/^[A-Z0-9]{2,12}$/, 'Unknown neighbourhood.'),
});

export const compareQuerySchema = z.object({
  ids: z
    .string('Choose two to four neighbourhoods to compare.')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(
      z
        .array(z.string().regex(/^[A-Z0-9]{2,12}$/, 'Unknown neighbourhood id.'))
        .min(2, 'Choose at least two neighbourhoods to compare.')
        .max(4, 'You can compare at most four neighbourhoods.')
        .refine((a) => new Set(a).size === a.length, 'Each neighbourhood can appear only once in a comparison.'),
    ),
});

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(2, 'Enter at least 2 characters.').max(120, 'Search text is too long.'),
});

export const historyQuerySchema = z.object({
  source: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  from: z.iso.date('Use a date in YYYY-MM-DD format.').optional(),
  to: z.iso.date('Use a date in YYYY-MM-DD format.').optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/** Scoring context shared by profile and comparison endpoints. */
export const scoringParamsSchema = z
  .object({
    radius: optionalInt('Radius must be 500, 1000 or 2000.'),
    destLat: optionalCoord(1.1, 1.5, 'Destination latitude is outside Singapore.'),
    destLng: optionalCoord(103.5, 104.2, 'Destination longitude is outside Singapore.'),
    destLabel: destLabel,
    th: thresholdsParam,
    ...weightParams,
  })
  .superRefine((q, ctx) => {
    if (q.radius !== undefined && !(PROXIMITY_RADII as readonly number[]).includes(q.radius))
      ctx.addIssue({ code: 'custom', path: ['radius'], message: 'Radius must be 500 m, 1 km or 2 km.' });
    if ((q.destLat === undefined) !== (q.destLng === undefined))
      ctx.addIssue({ code: 'custom', path: ['destLat'], message: 'Destination needs both latitude and longitude.' });
    for (const c of CRITERIA) {
      const v = (q as Record<string, unknown>)[`w_${c}`];
      if (typeof v === 'number' && (v < WEIGHT_MIN || v > WEIGHT_MAX))
        ctx.addIssue({ code: 'custom', path: [`w_${c}`], message: `Weight for ${c.replace('_', ' ')} must be between 0 and 5.` });
    }
  });

export const workspaceNameSchema = z.object({
  name: z.string().trim().min(1, 'Give the workspace a name.').max(60, 'Workspace names must be at most 60 characters.').regex(/^[^<>]*$/, 'Names cannot contain < or >.'),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(['ADMIN', 'MEMBER'], 'Role must be Admin or Member.').default('MEMBER'),
});

export const acceptInviteSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, 'This invite link is invalid.'),
});

export const checkoutSchema = z.object({
  plan: z.enum(['household', 'family', 'advisor'], 'Choose a plan.'),
});

export const memberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER'], 'Role must be Admin or Member.'),
});

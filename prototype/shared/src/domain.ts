// Shared domain vocabulary and business rules: local SRS V1.1 is the requirements baseline.

export const FAMILY_STAGES = [
  'expecting_child',
  'infant_care',
  'preschool',
  'primary_school',
  'secondary_school',
] as const;
export type FamilyStage = (typeof FAMILY_STAGES)[number];

export const FAMILY_STAGE_LABELS: Record<FamilyStage, string> = {
  expecting_child: 'Expecting a child',
  infant_care: 'Infant care',
  preschool: 'Preschool',
  primary_school: 'Primary school',
  secondary_school: 'Secondary school',
};

export const AMENITY_CATEGORIES = [
  'childcare',
  'kindergarten',
  'primary_school',
  'secondary_school',
  'supermarket',
  'clinic',
  'park_playground',
  'mrt',
  'bus_stop',
] as const;
export type AmenityCategory = (typeof AMENITY_CATEGORIES)[number];

export const AMENITY_LABELS: Record<AmenityCategory, string> = {
  childcare: 'Childcare centres',
  kindergarten: 'Kindergartens',
  primary_school: 'Primary schools',
  secondary_school: 'Secondary schools',
  supermarket: 'Supermarkets',
  clinic: 'Clinics',
  park_playground: 'Parks & playgrounds',
  mrt: 'MRT / LRT stations',
  bus_stop: 'Bus stops',
};

/** Material Symbols icon name per category (UI only). */
export const AMENITY_ICONS: Record<AmenityCategory, string> = {
  childcare: 'child_care',
  kindergarten: 'toys',
  primary_school: 'school',
  secondary_school: 'history_edu',
  supermarket: 'local_grocery_store',
  clinic: 'local_hospital',
  park_playground: 'park',
  mrt: 'train',
  bus_stop: 'directions_bus',
};

/** Family stage → amenity categories that stage needs nearby (used by the stage filter, FR-DISC-02). */
export const STAGE_CATEGORIES: Record<FamilyStage, AmenityCategory[]> = {
  expecting_child: ['clinic'],
  infant_care: ['childcare'],
  preschool: ['childcare', 'kindergarten'],
  primary_school: ['primary_school'],
  secondary_school: ['secondary_school'],
};

export const CRITERIA = [
  'childcare',
  'schools',
  'groceries',
  'healthcare',
  'green_spaces',
  'public_transport',
  'commute',
  'accessibility',
] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABELS: Record<Criterion, string> = {
  childcare: 'Childcare & preschool',
  schools: 'Schools',
  groceries: 'Groceries',
  healthcare: 'Healthcare',
  green_spaces: 'Green spaces',
  public_transport: 'Public transport',
  commute: 'Commute',
  accessibility: 'Accessibility',
};

export const CRITERION_ICONS: Record<Criterion, string> = {
  childcare: 'child_care',
  schools: 'school',
  groceries: 'local_grocery_store',
  healthcare: 'local_hospital',
  green_spaces: 'park',
  public_transport: 'train',
  commute: 'commute',
  accessibility: 'accessible',
};

export type CriterionWeights = Record<Criterion, number>;

export const DEFAULT_WEIGHTS: CriterionWeights = {
  childcare: 3,
  schools: 3,
  groceries: 3,
  healthcare: 3,
  green_spaces: 3,
  public_transport: 3,
  commute: 3,
  accessibility: 3,
};

// Business rules (SRS §5.24)
export const PROXIMITY_RADII = [500, 1000, 2000] as const;
export type ProximityRadius = (typeof PROXIMITY_RADII)[number];
export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 5;
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;
export const SHORTLIST_MAX = 10;
export const NOTE_MAX = 500;
export const DESTINATIONS_MAX = 3;
export const STALE_AFTER_DAYS = 31; // NFR-DATA-02
export const LOCKOUT_THRESHOLD = 5; // NFR-SEC-04
export const LOCKOUT_MINUTES = 15;

export const TRAVEL_MODES = ['pt', 'walk', 'drive', 'cycle'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];
export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  pt: 'Transit',
  walk: 'Walk',
  drive: 'Drive',
  cycle: 'Cycle',
};

export const SORT_OPTIONS = ['score', 'nearest', 'commute', 'coverage'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const SORT_LABELS: Record<SortOption, string> = {
  score: 'Family suitability score',
  nearest: 'Nearest selected amenity',
  commute: 'Commute time',
  coverage: 'Overall amenity coverage',
};

export type AvailabilityState = 'AVAILABLE' | 'NO_MATCH' | 'INCOMPLETE' | 'STALE' | 'UNAVAILABLE';

export const LIMITATION_EDUCATION =
  'Distance to a school or childcare centre does not guarantee admission, enrolment, vacancy, or eligibility.';
export const LIMITATION_SCORE =
  'Family suitability scores are comparative planning aids. They do not guarantee school admission, childcare availability, enrolment eligibility, property availability, or suitability for every family.';
export const LIMITATION_PROFILE =
  'Neighbourhood profile — not a live property listing or a guarantee of service availability.';

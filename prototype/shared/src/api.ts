// API response shapes shared by client and server.
import type {
  AmenityCategory,
  AvailabilityState,
  Criterion,
  CriterionWeights,
  FamilyStage,
  ProximityRadius,
  TravelMode,
} from './domain.js';

export interface ApiError {
  error: string;
  /** Field-specific correction guidance (NFR-USAB-02). */
  fields?: Record<string, string>;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  personal: boolean;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  ownerName: string;
  plan: 'household' | 'family' | 'advisor';
  memberCount: number;
  memberLimit: number;
  shortlistCount: number;
  shortlistLimit: number;
}

export interface Me {
  id: string;
  displayName: string;
  email: string;
  role: 'REGISTERED_USER' | 'DATA_ADMINISTRATOR';
  plan?: 'household' | 'family' | 'advisor';
  workspace?: WorkspaceSummary | null;
}

export interface MemberDto {
  accountId: string;
  displayName: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

export interface InviteDto {
  id: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  createdAt: string;
  expiresAt: string;
  link?: string;
}

export interface BillingDto {
  plan: 'household' | 'family' | 'advisor';
  status: 'none' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string | null;
  provider: 'stripe' | 'demo';
  canManage: boolean;
  usage: { ownedWorkspaces: number; ownedWorkspaceLimit: number };
}

/** Data Provenance Stamp (NFR-DATA-01). */
export interface Provenance {
  sourceId: string;
  provider: string;
  datasetName: string;
  publisherUpdatedAt: string | null;
  retrievedAt: string | null;
  datasetVersion: number | null;
  ageDays: number | null;
  stale: boolean;
  licence: string;
}

export interface FacilityDto {
  id: string;
  name: string;
  category: AmenityCategory;
  address: string | null;
  lat: number;
  lng: number;
  distanceM: number;
  sourceId: string;
  details?: Record<string, string>;
}

export interface AmenitySummaryDto {
  category: AmenityCategory;
  matchedCount: number;
  nearest: { id: string; name: string; distanceM: number } | null;
  state: AvailabilityState;
  stateReason?: string;
  provenance: Provenance[];
}

export interface CriterionBreakdown {
  criterion: Criterion;
  rawValue: number | null;
  rawLabel: string;
  normalisedValue: number | null; // 0..1
  weight: number;
  effectiveWeight: number; // after missing-data redistribution
  contribution: number; // points out of 100, unrounded
  missing: boolean;
  missingReason?: string;
  rule: string;
}

export interface FamilyScoreDto {
  total: number; // rounded 0..100 (exact .5 rounds up)
  unroundedTotal: number;
  configurationVersion: string;
  datasetVersions: Record<string, number>;
  breakdown: CriterionBreakdown[];
  weightTreatment: string;
  computedAt: string;
}

export interface NeighbourhoodSummary {
  id: string;
  name: string;
  planningArea: string;
  region: string;
  lat: number;
  lng: number;
  score: FamilyScoreDto;
  coverage: number; // categories with >=1 facility within radius
  highlights: { category: AmenityCategory; count: number; nearestM: number | null }[];
  commuteMin: number | null;
  nearestSelectedM: number | null;
}

export interface SearchResponse {
  total: number;
  page: number;
  pageSize: number;
  radius: ProximityRadius;
  results: NeighbourhoodSummary[];
  matchedBy: 'all' | 'name' | 'address';
  addressMatch?: { address: string; lat: number; lng: number; neighbourhoodId: string | null };
  limitation: string;
}

export interface NeighbourhoodDetail {
  id: string;
  name: string;
  planningArea: string;
  region: string;
  lat: number;
  lng: number;
  boundaryBasis: string;
  referencePointBasis: string;
  boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  radius: ProximityRadius;
  amenities: AmenitySummaryDto[];
  score: FamilyScoreDto;
  provenance: Provenance[];
  limitations: string[];
}

export interface RouteLeg {
  mode: string;
  durationS: number;
  distanceM: number;
  label: string;
}

export interface RouteEstimateDto {
  state: 'OK' | 'UNAVAILABLE' | 'NO_ROUTE' | 'UNSUPPORTED_MODE';
  mode: TravelMode;
  provider: string;
  retrievedAt: string;
  distanceM: number | null;
  durationS: number | null;
  legs: RouteLeg[];
  geometry: [number, number][] | null; // [lat, lng]
  barrierFree: { requested: boolean; covered: boolean; message: string };
  message?: string;
  estimateBasis?: string;
}

export interface PreferencesDto {
  familyStages: FamilyStage[];
  preferredAreas: string[];
  amenityThresholds: Partial<Record<AmenityCategory, ProximityRadius>>;
  weights: CriterionWeights;
  confirmedWeights: Criterion[];
  destinations: { label: string; queryText: string; address: string; lat: number; lng: number }[];
  updatedAt: string | null;
}

export interface ShortlistEntryDto {
  neighbourhoodId: string;
  addedAt: string;
  note: string;
  noteUpdatedAt: string | null;
  neighbourhood: NeighbourhoodSummary | null;
}

export interface DataSourceStatusDto {
  id: string;
  name: string;
  provider: string;
  categories: string[];
  status: 'OK' | 'FAILED' | 'STALE' | 'NEVER_RUN' | 'DELAYED' | 'RUNNING' | 'LIVE';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  recordCount: number | null;
  activeVersion: number | null;
  publisherUpdatedAt: string | null;
  freshnessThresholdDays: number;
  schedule: string;
  nextRunAt: string | null;
  lastError: string | null;
}

export interface SyncHistoryDto {
  id: string;
  sourceId: string;
  sourceName: string;
  startedAt: string;
  endedAt: string | null;
  outcome: 'SUCCESS' | 'NO_CHANGES' | 'FAILED' | 'RUNNING';
  recordsAdded: number;
  recordsChanged: number;
  recordsRemoved: number;
  sanitisedError: string | null;
  trigger: 'SCHEDULE' | 'STARTUP' | 'CLI';
}

export interface AreaDto {
  planningArea: string;
  region: string;
  neighbourhoods: number;
}

export interface GeocodeResult {
  label: string;
  address: string;
  postal: string | null;
  lat: number;
  lng: number;
}

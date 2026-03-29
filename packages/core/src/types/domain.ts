export type RegionId = 'iran' | 'israel' | 'arabian-peninsula' | 'eastern-mediterranean' | string;

export type WindowHours = 6 | 24 | 72;

export interface PointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export type SupportedGeometry = PointGeometry | PolygonGeometry;

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface RegionDefinition {
  id: RegionId;
  name: string;
  description: string;
  geometry: PolygonGeometry;
  bbox: BoundingBox;
  tags: string[];
  source: 'built_in' | 'custom';
  createdAt: string;
}

export interface RawSourcePayload {
  id: string;
  provider: string;
  sourceType: 'track' | 'conflict_indicator' | 'restriction' | 'bulletin';
  ingestedAt: string;
  receivedAt: string;
  raw: Record<string, unknown>;
  attribution: {
    name: string;
    termsUrl?: string;
    citationUrl?: string;
    note?: string;
  };
}

export interface ProviderTrackObservation {
  id: string;
  provider: string;
  observedAt: string;
  icao24: string;
  callsign?: string;
  latitude: number;
  longitude: number;
  altitudeFt?: number;
  heading?: number;
  speedKts?: number;
  squawk?: string;
  origin?: string;
  destination?: string;
  aircraftType?: string;
  sourcePayloadId: string;
}

export type TrackAnomalyType =
  | 'route_deviation'
  | 'abrupt_altitude_change'
  | 'holding_pattern'
  | 'transponder_loss'
  | 'corridor_shift'
  | 'airspace_exit_reentry';

export interface TrackAnomaly {
  type: TrackAnomalyType;
  observedAt: string;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  relatedRegionIds: RegionId[];
  point?: PointGeometry;
}

export interface TrackPoint {
  observedAt: string;
  latitude: number;
  longitude: number;
  altitudeFt?: number;
  heading?: number;
  speedKts?: number;
  provider: string;
  sourcePayloadId: string;
}

export interface FlightTrack {
  id: string;
  icao24: string;
  callsign?: string;
  squawk?: string;
  origin?: string;
  destination?: string;
  aircraftType?: string;
  providers: string[];
  startTime: string;
  endTime: string;
  points: TrackPoint[];
  anomalies: TrackAnomaly[];
  regionIds: RegionId[];
}

export type IndicatorType =
  | 'notam_restriction'
  | 'icao_bulletin'
  | 'easa_bulletin'
  | 'thermal_anomaly'
  | 'osint_report'
  | 'news_report';

export interface ConflictIndicator {
  id: string;
  provider: string;
  type: IndicatorType;
  observedAt: string;
  expiresAt?: string;
  geometry: SupportedGeometry;
  regionIds: RegionId[];
  headline: string;
  description: string;
  severity: 'info' | 'advisory' | 'warning' | 'critical';
  sourcePayloadId: string;
  independentSourceCount: number;
  metadata: Record<string, unknown>;
}

export interface AirspaceRestriction {
  id: string;
  provider: string;
  title: string;
  observedAt: string;
  expiresAt?: string;
  geometry: SupportedGeometry;
  regionIds: RegionId[];
  restrictionLevel: 'advisory' | 'closure' | 'avoidance';
  summary: string;
  sourcePayloadId: string;
}

export type EventType =
  | 'confirmed_strike'
  | 'probable_strike'
  | 'airspace_closure'
  | 'aircraft_diversion_cluster'
  | 'thermal_anomaly'
  | 'unverified_report';

export interface ReasoningSignal {
  label: string;
  effect: 'increase' | 'decrease';
  weight: number;
  evidence: string;
}

export interface EventReasoning {
  score: number;
  confidenceLabel: 'low' | 'moderate' | 'high';
  signals: ReasoningSignal[];
  explanation: string;
}

export interface EventEvidence {
  provider: string;
  sourceType: IndicatorType | TrackAnomalyType | 'restriction' | 'track';
  sourcePayloadId: string;
  summary: string;
  observedAt: string;
}

export interface InferredEvent {
  id: string;
  eventType: EventType;
  startedAt: string;
  endedAt: string;
  geometry: SupportedGeometry;
  regionIds: RegionId[];
  sourceProviders: string[];
  evidence: EventEvidence[];
  confidence: number;
  reasoning: EventReasoning;
  title: string;
  summary: string;
}

export interface CorridorDensity {
  corridorId: string;
  corridorName: string;
  regionId: RegionId;
  currentTrackCount: number;
  baselineTrackCount: number;
  deltaPct: number;
}

export interface DeviationSummary {
  routeDeviationCount: number;
  abruptAltitudeChangeCount: number;
  holdingPatternCount: number;
  transponderLossCount: number;
  corridorShiftCount: number;
}

export interface AnalyticsSummary {
  corridorDensity: CorridorDensity[];
  deviations: DeviationSummary;
  transponderLossWindows: Array<{ start: string; end: string; impactedAircraft: string[] }>;
  rerouteClusters: Array<{ regionId: RegionId; start: string; end: string; aircraftIds: string[] }>;
  thermalClusters: Array<{ clusterId: string; startedAt: string; endedAt: string; regionIds: RegionId[]; indicatorIds: string[] }>;
  eventCorrelationStats: Record<EventType, number>;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  windowHours: WindowHours;
  regions: RegionDefinition[];
  restrictions: AirspaceRestriction[];
  tracks: FlightTrack[];
  indicators: ConflictIndicator[];
  events: InferredEvent[];
  rawPayloads: RawSourcePayload[];
  analytics: AnalyticsSummary;
  stats: {
    providerFailures: number;
    ingestionLagSeconds: number;
    dedupeRate: number;
    eventVolume: number;
  };
}

export interface SnapshotQuery {
  region?: RegionId;
  start?: string;
  end?: string;
  minConfidence?: number;
  altitudeBand?: { min?: number; max?: number };
  sourceType?: string;
  bbox?: BoundingBox;
}

export interface ProviderContext {
  now: string;
  windowHours: WindowHours;
  regionIds: RegionId[];
}

export interface TrackProvider {
  readonly name: string;
  fetch(context: ProviderContext): Promise<ProviderTrackObservation[]>;
}

export interface ConflictProvider {
  readonly name: string;
  fetch(context: ProviderContext): Promise<ConflictIndicator[]>;
}

export interface RestrictionProvider {
  readonly name: string;
  fetch(context: ProviderContext): Promise<AirspaceRestriction[]>;
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export interface LoggerLike {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
  debug?(payload: unknown, message?: string): void;
}

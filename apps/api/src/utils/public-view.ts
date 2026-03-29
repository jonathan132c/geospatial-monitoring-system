import type { AirspaceRestriction, FlightTrack, InferredEvent, RawSourcePayload, SupportedGeometry } from '../../../../packages/core/src';

const COORD_DECIMALS = 1;

export const PUBLIC_SAFETY_NOTICE = 'Non-operational public-source analytical output only. Historical/seeded or delayed data, coarsened map geometry, probabilistic inference, and no live tactical guidance.';

export const EVENT_TYPE_LABELS: Record<string, string> = {
  confirmed_strike: 'Historically corroborated public-source event candidate',
  probable_strike: 'Probabilistic public-source event candidate',
  airspace_closure: 'Public airspace restriction',
  aircraft_diversion_cluster: 'Aircraft diversion cluster',
  thermal_anomaly: 'Thermal anomaly cluster',
  unverified_report: 'Unverified public-source report'
};

const round = (value: number): number => Number(value.toFixed(COORD_DECIMALS));

const coarsenGeometry = (geometry: SupportedGeometry): SupportedGeometry => {
  if (geometry.type === 'Point') {
    return { ...geometry, coordinates: [round(geometry.coordinates[0]), round(geometry.coordinates[1])] };
  }

  return {
    ...geometry,
    coordinates: geometry.coordinates.map((ring) => ring.map(([lon, lat]) => [round(lon), round(lat)] as [number, number]))
  };
};

const summarizeRawPayload = (value: unknown, parentKey = ''): unknown => {
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => summarizeRawPayload(item, parentKey));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 20).map(([key, nested]) => [key, summarizeRawPayload(nested, key)])
    );
  }

  if (typeof value === 'number' && /lat|lon|lng|longitude|latitude/i.test(parentKey)) {
    return round(value);
  }

  return value;
};

export const toPublicTrack = (track: FlightTrack): FlightTrack & { safetyNotice: string; delayed: true; coordinatePrecision: string } => ({
  ...track,
  points: track.points.map((point) => ({
    ...point,
    latitude: round(point.latitude),
    longitude: round(point.longitude)
  })),
  anomalies: track.anomalies.map((anomaly) => ({
    ...anomaly,
    point: anomaly.point ? { ...anomaly.point, coordinates: [round(anomaly.point.coordinates[0]), round(anomaly.point.coordinates[1])] } : undefined
  })),
  safetyNotice: PUBLIC_SAFETY_NOTICE,
  delayed: true,
  coordinatePrecision: `coarsened to ~0.${'0'.repeat(Math.max(0, COORD_DECIMALS - 1))}1° resolution`
});

export const toPublicRestriction = (restriction: AirspaceRestriction): AirspaceRestriction & { safetyNotice: string; delayed: true } => ({
  ...restriction,
  geometry: coarsenGeometry(restriction.geometry),
  title: `Public-source restriction: ${restriction.title}`,
  safetyNotice: PUBLIC_SAFETY_NOTICE,
  delayed: true
});

export const toPublicEvent = (event: InferredEvent): InferredEvent & {
  publicLabel: string;
  displayTitle: string;
  safetyNotice: string;
  publicUseClassification: 'research-journalistic-humanitarian';
  delayed: true;
} => {
  const label = EVENT_TYPE_LABELS[event.eventType] ?? 'Public-source analytical event';

  return {
    ...event,
    title: label,
    geometry: coarsenGeometry(event.geometry),
    publicLabel: label,
    displayTitle: label,
    safetyNotice: PUBLIC_SAFETY_NOTICE,
    publicUseClassification: 'research-journalistic-humanitarian',
    delayed: true,
    summary: `${event.summary} This is a public-source analytical inference, not operational guidance.`
  };
};

export const sanitizeRawPayloadForApi = (payload: RawSourcePayload) => ({
  id: payload.id,
  provider: payload.provider,
  sourceType: payload.sourceType,
  receivedAt: payload.receivedAt,
  ingestedAt: payload.ingestedAt,
  attribution: payload.attribution,
  rawSummary: summarizeRawPayload(payload.raw),
  safetyNotice: 'Raw payload preserved locally for auditability; API view is summarized and coordinate-coarsened for non-operational use.'
});

export const publicResponseMeta = (resource: string) => ({
  resource,
  mode: 'non-operational-public-source-analytical-demo',
  delayModel: 'seeded/historical snapshot or delayed analytical output',
  coordinatePrecision: 'coarsened for public map display',
  safetyNotice: PUBLIC_SAFETY_NOTICE
});

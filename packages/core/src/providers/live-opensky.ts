import { randomUUID } from 'node:crypto';
import { pointInBoundingBox, pointInPolygon } from '../geo/geometry';
import type {
  BoundingBox,
  LoggerLike,
  ProviderContext,
  ProviderRunStatus,
  ProviderTrackObservation,
  RawSourcePayload,
  RegionDefinition
} from '../types/domain';

const METERS_TO_FEET = 3.28084;
const MPS_TO_KNOTS = 1.943844;
const MAX_STALENESS_SECONDS = 15 * 60;
const OPENSKY_URL = 'https://opensky-network.org/api/states/all';

export interface ResponseLike {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<ResponseLike>;

export interface OpenSkyLiveFetchOptions {
  context: ProviderContext;
  logger: LoggerLike;
  regions: RegionDefinition[];
  fetchImpl?: FetchLike;
}

interface OpenSkyResponse {
  time?: number;
  states?: unknown[];
}

export interface OpenSkyLiveFetchResult {
  observations: ProviderTrackObservation[];
  rawPayloads: RawSourcePayload[];
  providerStatus: ProviderRunStatus;
}

const trimString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asNumber = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const toFeet = (value: number | undefined): number | undefined => value === undefined ? undefined : Math.round(value * METERS_TO_FEET);
const toKnots = (value: number | undefined): number | undefined => value === undefined ? undefined : Math.round(value * MPS_TO_KNOTS);

const combineBoundingBoxes = (regions: RegionDefinition[]): BoundingBox => ({
  minLon: Math.min(...regions.map((region) => region.bbox.minLon)),
  minLat: Math.min(...regions.map((region) => region.bbox.minLat)),
  maxLon: Math.max(...regions.map((region) => region.bbox.maxLon)),
  maxLat: Math.max(...regions.map((region) => region.bbox.maxLat))
});

const inSelectedRegions = (latitude: number, longitude: number, regions: RegionDefinition[]): boolean => {
  const point = { type: 'Point' as const, coordinates: [longitude, latitude] as [number, number] };
  return regions.some((region) => pointInBoundingBox(point, region.bbox) && pointInPolygon(point, region.geometry));
};

const buildUrl = (bbox: BoundingBox): string => {
  const params = new URLSearchParams({
    lamin: String(bbox.minLat),
    lomin: String(bbox.minLon),
    lamax: String(bbox.maxLat),
    lomax: String(bbox.maxLon)
  });
  return `${OPENSKY_URL}?${params.toString()}`;
};

const defaultFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, { headers: init?.headers });
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: async () => response.json(),
    text: async () => response.text()
  };
};

export const fetchOpenSkyLiveTracks = async ({
  context,
  logger,
  regions,
  fetchImpl = defaultFetch
}: OpenSkyLiveFetchOptions): Promise<OpenSkyLiveFetchResult> => {
  const selectedRegions = regions.filter((region) => context.regionIds.includes(region.id));
  if (selectedRegions.length === 0) {
    return {
      observations: [],
      rawPayloads: [],
      providerStatus: {
        provider: 'opensky',
        kind: 'track',
        access: 'public',
        status: 'disabled',
        enabled: false,
        liveCapable: true,
        recordCount: 0,
        rawPayloadCount: 0,
        reason: 'No selected regions matched the built-in monitoring catalog.'
      }
    };
  }

  const bbox = combineBoundingBoxes(selectedRegions);
  const requestUrl = buildUrl(bbox);
  const requestHeaders = { 'User-Agent': 'geospatial-monitoring-system-live/0.1' };
  const response = await fetchImpl(requestUrl, { headers: requestHeaders });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`OpenSky request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}): ${errorBody.slice(0, 200)}`);
  }

  const payload = await response.json() as OpenSkyResponse;
  const receivedAt = typeof payload.time === 'number'
    ? new Date(payload.time * 1000).toISOString()
    : context.now;
  const sourcePayloadId = `raw-opensky-${randomUUID()}`;
  const rawPayloads: RawSourcePayload[] = [{
    id: sourcePayloadId,
    provider: 'opensky',
    sourceType: 'track',
    ingestedAt: context.now,
    receivedAt,
    raw: {
      requestUrl,
      selectedRegionIds: context.regionIds,
      bbox,
      response: payload
    },
    attribution: {
      name: 'OpenSky Network public states/all endpoint',
      citationUrl: requestUrl,
      termsUrl: 'https://opensky-network.org/about/terms-of-use',
      note: 'Unauthenticated public state-vector snapshot. This build only uses the current public states endpoint in live mode; no fixture fallback occurs.'
    }
  }];

  const nowMs = new Date(context.now).getTime();
  const states = Array.isArray(payload.states) ? payload.states : [];
  const observations = states.flatMap((entry, index) => {
    if (!Array.isArray(entry)) return [];

    const icao24 = trimString(entry[0]);
    const callsign = trimString(entry[1]);
    const timePosition = asNumber(entry[3]);
    const lastContact = asNumber(entry[4]);
    const longitude = asNumber(entry[5]);
    const latitude = asNumber(entry[6]);
    const baroAltitude = asNumber(entry[7]);
    const onGround = entry[8] === true;
    const velocity = asNumber(entry[9]);
    const heading = asNumber(entry[10]);
    const geoAltitude = asNumber(entry[13]);
    const squawk = trimString(entry[14]);

    if (!icao24 || latitude === undefined || longitude === undefined) return [];
    if (onGround) return [];
    if (!inSelectedRegions(latitude, longitude, selectedRegions)) return [];

    const observedAtSeconds = timePosition ?? lastContact ?? Math.floor(nowMs / 1000);
    if (nowMs - observedAtSeconds * 1000 > MAX_STALENESS_SECONDS * 1000) return [];

    return [{
      id: `opensky-${icao24}-${observedAtSeconds}-${index + 1}`,
      provider: 'opensky',
      observedAt: new Date(observedAtSeconds * 1000).toISOString(),
      icao24,
      callsign,
      latitude,
      longitude,
      altitudeFt: toFeet(geoAltitude ?? baroAltitude),
      heading,
      speedKts: toKnots(velocity),
      squawk,
      sourcePayloadId
    } satisfies ProviderTrackObservation];
  });

  logger.info({ provider: 'opensky', fetched: states.length, retained: observations.length, requestUrl }, 'Fetched live OpenSky public tracks');

  return {
    observations,
    rawPayloads,
    providerStatus: {
      provider: 'opensky',
      kind: 'track',
      access: 'public',
      status: 'success',
      enabled: true,
      liveCapable: true,
      recordCount: observations.length,
      rawPayloadCount: rawPayloads.length,
      reason: observations.length === 0
        ? 'OpenSky request succeeded but returned no airborne observations inside the selected monitoring regions.'
        : 'Live public OpenSky current-state observations ingested successfully.'
    }
  };
};

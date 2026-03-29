import { buildAnalyticsSummary } from '../analytics/summary';
import { correlateEvents } from '../correlation/events';
import {
  DEMO_NOW,
  defaultRegions,
  getIndicatorFixtures,
  getRawPayloadFixtures,
  getRestrictionFixtures,
  getTrackFixtures
} from '../demo/fixtures';
import { buildFlightTracks, deduplicateTrackObservations } from '../normalization/tracks';
import {
  AdsbExchangeTrackProvider,
  BulletinConflictProvider,
  FirmsThermalProvider,
  FlightAwareCompatibleTrackProvider,
  NotamRestrictionProvider,
  OpenSkyTrackProvider,
  OsintNewsProvider
} from '../providers/adapters';
import { InMemoryCacheAdapter } from '../providers/cache';
import { fetchOpenSkyLiveTracks, type FetchLike } from '../providers/live-opensky';
import type {
  ConflictProvider,
  ConflictIndicator,
  LoggerLike,
  MonitoringSnapshot,
  ProviderContext,
  ProviderRunStatus,
  RawSourcePayload,
  RestrictionProvider,
  SnapshotMode,
  TrackProvider,
  WindowHours,
  ProviderTrackObservation,
  AirspaceRestriction,
  SnapshotSourceMetadata
} from '../types/domain';

export interface SnapshotBuildOptions {
  logger: LoggerLike;
  now?: string;
  windowHours?: WindowHours;
  sourceMode?: SnapshotMode;
  fetchImpl?: FetchLike;
}

const getProviderRawPayloadCount = (payloads: RawSourcePayload[], provider: string): number =>
  payloads.filter((payload) => payload.provider === provider).length;

const resolveSnapshotMode = (sourceMode?: SnapshotMode): SnapshotMode => sourceMode ?? (process.env.SNAPSHOT_MODE === 'live' ? 'live' : 'demo');

const executeProviders = async <T extends { name: string; fetch: (context: ProviderContext) => Promise<unknown[]> }>(
  providers: T[],
  context: ProviderContext,
  logger: LoggerLike,
  providerKind: ProviderRunStatus['kind'],
  access: ProviderRunStatus['access']
): Promise<{ results: unknown[]; failures: number; statuses: ProviderRunStatus[] }> => {
  let failures = 0;
  const settled = await Promise.allSettled(providers.map((provider) => provider.fetch(context)));
  const results = settled.flatMap((entry, index) => {
    if (entry.status === 'rejected') {
      failures += 1;
      logger.warn({ provider: providers[index]?.name, error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason) }, 'Provider failed');
      return [];
    }
    return entry.value;
  });

  const statuses = settled.map((entry, index) => {
    const provider = providers[index]!;
    if (entry.status === 'rejected') {
      return {
        provider: provider.name,
        kind: providerKind,
        access,
        status: 'failed' as const,
        enabled: true,
        liveCapable: access !== 'fixture',
        recordCount: 0,
        rawPayloadCount: 0,
        reason: entry.reason instanceof Error ? entry.reason.message : String(entry.reason)
      };
    }

    return {
      provider: provider.name,
      kind: providerKind,
      access,
      status: 'success' as const,
      enabled: true,
      liveCapable: access !== 'fixture',
      recordCount: entry.value.length,
      rawPayloadCount: 0,
      reason: access === 'fixture'
        ? 'Offline fixture provider used for demo mode.'
        : 'Provider executed successfully.'
    };
  });

  return { results, failures, statuses };
};

const createDemoProviders = (logger: LoggerLike) => {
  const cache = new InMemoryCacheAdapter();
  const trackProviders: TrackProvider[] = [
    new OpenSkyTrackProvider({ name: 'opensky', cache, logger, loader: async () => getTrackFixtures('opensky') }),
    new AdsbExchangeTrackProvider({ name: 'adsb_exchange', cache, logger, loader: async () => getTrackFixtures('adsb_exchange') }),
    new FlightAwareCompatibleTrackProvider({ name: 'flightaware', cache, logger, loader: async () => getTrackFixtures('flightaware') })
  ];

  const restrictionProviders: RestrictionProvider[] = [
    new NotamRestrictionProvider({ name: 'notam_feed', cache, logger, loader: async () => getRestrictionFixtures('notam_feed') })
  ];

  const conflictProviders: ConflictProvider[] = [
    new BulletinConflictProvider({ name: 'icao_bulletins', cache, logger, loader: async () => getIndicatorFixtures('icao_bulletins') }),
    new BulletinConflictProvider({ name: 'easa_bulletins', cache, logger, loader: async () => getIndicatorFixtures('easa_bulletins') }),
    new FirmsThermalProvider({ name: 'nasa_firms', cache, logger, loader: async () => getIndicatorFixtures('nasa_firms') }),
    new OsintNewsProvider({ name: 'osint_news', cache, logger, loader: async () => getIndicatorFixtures('osint_news') })
  ];

  return { trackProviders, restrictionProviders, conflictProviders };
};

const buildDemoSourceMetadata = (providerStatuses: ProviderRunStatus[]): SnapshotSourceMetadata => ({
  mode: 'demo',
  liveData: false,
  honestLivePath: false,
  fixtureBacked: true,
  activeProviders: providerStatuses.filter((status) => status.enabled && status.recordCount > 0).map((status) => status.provider),
  notes: [
    'Demo mode uses offline fixtures for all providers.',
    'No network calls are made in demo mode.',
    'Use SNAPSHOT_MODE=live to fetch actual public live tracks where implemented.'
  ],
  providerStatuses
});

const withDemoRawPayloadCounts = (statuses: ProviderRunStatus[], rawPayloads: RawSourcePayload[]): ProviderRunStatus[] =>
  statuses.map((status) => ({
    ...status,
    rawPayloadCount: getProviderRawPayloadCount(rawPayloads, status.provider)
  }));

const calculateIngestionLagSeconds = (now: string, observations: ProviderTrackObservation[], rawPayloads: RawSourcePayload[]): number => {
  const nowMs = new Date(now).getTime();
  const candidateTimes = [
    ...observations.map((item) => new Date(item.observedAt).getTime()),
    ...rawPayloads.map((item) => new Date(item.receivedAt).getTime())
  ].filter((value) => Number.isFinite(value));

  if (candidateTimes.length === 0) return 0;
  const freshest = Math.max(...candidateTimes);
  return Math.max(0, Math.round((nowMs - freshest) / 1000));
};

const buildLiveProviderStatuses = (openskyStatus: ProviderRunStatus): ProviderRunStatus[] => [
  openskyStatus,
  {
    provider: 'adsb_exchange',
    kind: 'track',
    access: 'credentialed',
    status: 'unsupported',
    enabled: false,
    liveCapable: false,
    recordCount: 0,
    rawPayloadCount: 0,
    reason: 'No acceptable unauthenticated live API is wired for ADS-B Exchange in this build.'
  },
  {
    provider: 'flightaware',
    kind: 'track',
    access: 'credentialed',
    status: 'disabled',
    enabled: false,
    liveCapable: true,
    recordCount: 0,
    rawPayloadCount: 0,
    reason: 'FlightAware live ingestion requires credentials/licensing and is not enabled by default.'
  },
  {
    provider: 'notam_feed',
    kind: 'restriction',
    access: 'manual',
    status: 'unsupported',
    enabled: false,
    liveCapable: false,
    recordCount: 0,
    rawPayloadCount: 0,
    reason: 'No structured public NOTAM feed is wired without credentials or brittle scraping.'
  },
  {
    provider: 'icao_bulletins',
    kind: 'conflict',
    access: 'manual',
    status: 'unsupported',
    enabled: false,
    liveCapable: false,
    recordCount: 0,
    rawPayloadCount: 0,
    reason: 'ICAO bulletins are not exposed here as a clean live machine-readable feed.'
  },
  {
    provider: 'easa_bulletins',
    kind: 'conflict',
    access: 'manual',
    status: 'unsupported',
    enabled: false,
    liveCapable: false,
    recordCount: 0,
    rawPayloadCount: 0,
    reason: 'EASA bulletin ingestion would require manual curation or scraping and is intentionally disabled.'
  },
  {
    provider: 'nasa_firms',
    kind: 'conflict',
    access: 'credentialed',
    status: 'disabled',
    enabled: false,
    liveCapable: true,
    recordCount: 0,
    rawPayloadCount: 0,
    reason: 'NASA FIRMS live API access requires a MAP_KEY and is not enabled in this branch by default.'
  },
  {
    provider: 'osint_news',
    kind: 'conflict',
    access: 'manual',
    status: 'unsupported',
    enabled: false,
    liveCapable: false,
    recordCount: 0,
    rawPayloadCount: 0,
    reason: 'OSINT/news ingestion is not automated live here because acceptable sourcing requires manual vetting.'
  }
];

const buildLiveSourceMetadata = (providerStatuses: ProviderRunStatus[], rawPayloads: RawSourcePayload[]): SnapshotSourceMetadata => ({
  mode: 'live',
  liveData: providerStatuses.some((status) => status.provider === 'opensky' && status.status === 'success' && status.recordCount > 0),
  honestLivePath: true,
  fixtureBacked: false,
  activeProviders: providerStatuses.filter((status) => status.enabled && status.status === 'success').map((status) => status.provider),
  notes: [
    'Live mode does not fall back to fixtures.',
    'Only genuinely implemented live providers are executed; unsupported providers remain disabled/off by default.',
    'This build currently ingests current public OpenSky track states and leaves credentialed/manual providers inactive until explicitly implemented.'
  ],
  providerStatuses: providerStatuses.map((status) => ({
    ...status,
    rawPayloadCount: status.provider === 'opensky' ? rawPayloads.length : status.rawPayloadCount
  }))
});

const buildDemoSnapshot = async ({ logger, now, windowHours }: Required<Pick<SnapshotBuildOptions, 'logger' | 'windowHours'>> & { now: string }): Promise<MonitoringSnapshot> => {
  const { trackProviders, restrictionProviders, conflictProviders } = createDemoProviders(logger);
  const context: ProviderContext = {
    now,
    windowHours,
    regionIds: defaultRegions.map((region) => region.id)
  };

  const tracksExecution = await executeProviders(trackProviders as Array<TrackProvider & { name: string }>, context, logger, 'track', 'fixture');
  const restrictionsExecution = await executeProviders(restrictionProviders as Array<RestrictionProvider & { name: string }>, context, logger, 'restriction', 'fixture');
  const conflictsExecution = await executeProviders(conflictProviders as Array<ConflictProvider & { name: string }>, context, logger, 'conflict', 'fixture');

  const observations = tracksExecution.results as ProviderTrackObservation[];
  const restrictions = restrictionsExecution.results as AirspaceRestriction[];
  const indicators = conflictsExecution.results as ConflictIndicator[];
  const rawPayloads = getRawPayloadFixtures();

  const providerStatuses = withDemoRawPayloadCounts([
    ...tracksExecution.statuses,
    ...restrictionsExecution.statuses,
    ...conflictsExecution.statuses
  ], rawPayloads);

  const { deduped, dedupeRate } = deduplicateTrackObservations(observations);
  const tracks = buildFlightTracks(deduped, defaultRegions);
  const events = correlateEvents(tracks, indicators, restrictions, defaultRegions);
  const analytics = buildAnalyticsSummary(tracks, indicators, events);

  return {
    generatedAt: now,
    windowHours,
    sourceMetadata: buildDemoSourceMetadata(providerStatuses),
    regions: defaultRegions,
    restrictions,
    tracks,
    indicators,
    events,
    rawPayloads,
    analytics,
    stats: {
      providerFailures: tracksExecution.failures + restrictionsExecution.failures + conflictsExecution.failures,
      ingestionLagSeconds: 90,
      dedupeRate: Number(dedupeRate.toFixed(3)),
      eventVolume: events.length
    }
  };
};

const buildLiveSnapshot = async ({
  logger,
  now,
  windowHours,
  fetchImpl
}: Required<Pick<SnapshotBuildOptions, 'logger' | 'windowHours'>> & { now: string; fetchImpl?: FetchLike }): Promise<MonitoringSnapshot> => {
  const context: ProviderContext = {
    now,
    windowHours,
    regionIds: defaultRegions.map((region) => region.id)
  };

  let observations: ProviderTrackObservation[] = [];
  let rawPayloads: RawSourcePayload[] = [];
  let openskyStatus: ProviderRunStatus;
  let providerFailures = 0;

  try {
    const liveResult = await fetchOpenSkyLiveTracks({ context, logger, regions: defaultRegions, fetchImpl });
    observations = liveResult.observations;
    rawPayloads = liveResult.rawPayloads;
    openskyStatus = liveResult.providerStatus;
  } catch (error) {
    providerFailures += 1;
    logger.warn({ provider: 'opensky', error: error instanceof Error ? error.message : String(error) }, 'Live provider failed');
    openskyStatus = {
      provider: 'opensky',
      kind: 'track',
      access: 'public',
      status: 'failed',
      enabled: true,
      liveCapable: true,
      recordCount: 0,
      rawPayloadCount: 0,
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  const providerStatuses = buildLiveProviderStatuses(openskyStatus);
  const { deduped, dedupeRate } = deduplicateTrackObservations(observations);
  const tracks = buildFlightTracks(deduped, defaultRegions);
  const restrictions: AirspaceRestriction[] = [];
  const indicators: ConflictIndicator[] = [];
  const events: ReturnType<typeof correlateEvents> = [];
  const analytics = buildAnalyticsSummary(tracks, indicators, events);

  return {
    generatedAt: now,
    windowHours,
    sourceMetadata: buildLiveSourceMetadata(providerStatuses, rawPayloads),
    regions: defaultRegions,
    restrictions,
    tracks,
    indicators,
    events,
    rawPayloads,
    analytics,
    stats: {
      providerFailures,
      ingestionLagSeconds: calculateIngestionLagSeconds(now, observations, rawPayloads),
      dedupeRate: Number(dedupeRate.toFixed(3)),
      eventVolume: events.length
    }
  };
};

export const buildMonitoringSnapshot = async ({
  logger,
  now,
  windowHours = 72,
  sourceMode,
  fetchImpl
}: SnapshotBuildOptions): Promise<MonitoringSnapshot> => {
  const mode = resolveSnapshotMode(sourceMode);
  const resolvedNow = now ?? (mode === 'live' ? new Date().toISOString() : DEMO_NOW);

  if (mode === 'live') {
    return buildLiveSnapshot({ logger, now: resolvedNow, windowHours, fetchImpl });
  }

  return buildDemoSnapshot({ logger, now: resolvedNow, windowHours });
};

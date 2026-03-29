import { buildAnalyticsSummary } from '../analytics/summary';
import { correlateEvents } from '../correlation/events';
import { DEMO_NOW, defaultRegions, getIndicatorFixtures, getRawPayloadFixtures, getRestrictionFixtures, getTrackFixtures } from '../demo/fixtures';
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
import type {
  ConflictProvider,
  LoggerLike,
  MonitoringSnapshot,
  ProviderContext,
  RestrictionProvider,
  TrackProvider,
  WindowHours
} from '../types/domain';

export interface SnapshotBuildOptions {
  logger: LoggerLike;
  now?: string;
  windowHours?: WindowHours;
}

const createProviders = (logger: LoggerLike) => {
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

const executeProviders = async <T extends { name: string; fetch: (context: ProviderContext) => Promise<unknown[]> }>(
  providers: T[],
  context: ProviderContext,
  logger: LoggerLike
): Promise<{ results: unknown[]; failures: number }> => {
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
  return { results, failures };
};

export const buildMonitoringSnapshot = async ({ logger, now = DEMO_NOW, windowHours = 72 }: SnapshotBuildOptions): Promise<MonitoringSnapshot> => {
  const { trackProviders, restrictionProviders, conflictProviders } = createProviders(logger);
  const context: ProviderContext = {
    now,
    windowHours,
    regionIds: defaultRegions.map((region) => region.id)
  };

  const tracksExecution = await executeProviders(trackProviders as Array<TrackProvider & { name: string }>, context, logger);
  const restrictionsExecution = await executeProviders(restrictionProviders as Array<RestrictionProvider & { name: string }>, context, logger);
  const conflictsExecution = await executeProviders(conflictProviders as Array<ConflictProvider & { name: string }>, context, logger);

  const observations = tracksExecution.results as ReturnType<typeof getTrackFixtures>;
  const restrictions = restrictionsExecution.results as ReturnType<typeof getRestrictionFixtures>;
  const indicators = conflictsExecution.results as ReturnType<typeof getIndicatorFixtures>;

  const { deduped, dedupeRate } = deduplicateTrackObservations(observations);
  const tracks = buildFlightTracks(deduped, defaultRegions);
  const events = correlateEvents(tracks, indicators, restrictions, defaultRegions);
  const analytics = buildAnalyticsSummary(tracks, indicators, events);

  return {
    generatedAt: now,
    windowHours,
    regions: defaultRegions,
    restrictions,
    tracks,
    indicators,
    events,
    rawPayloads: getRawPayloadFixtures(),
    analytics,
    stats: {
      providerFailures: tracksExecution.failures + restrictionsExecution.failures + conflictsExecution.failures,
      ingestionLagSeconds: 90,
      dedupeRate: Number(dedupeRate.toFixed(3)),
      eventVolume: events.length
    }
  };
};

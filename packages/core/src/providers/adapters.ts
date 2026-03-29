import { toUtcIso } from '../utils/time';
import type {
  AirspaceRestriction,
  CacheAdapter,
  ConflictIndicator,
  ConflictProvider,
  LoggerLike,
  ProviderContext,
  ProviderTrackObservation,
  RestrictionProvider,
  TrackProvider
} from '../types/domain';
import { withRetry } from './retry';

export interface FixtureProviderOptions<T> {
  name: string;
  ttlSeconds?: number;
  cache?: CacheAdapter;
  logger: LoggerLike;
  loader: (context: ProviderContext) => Promise<T[]>;
}

abstract class BaseFixtureProvider<T> {
  constructor(protected readonly options: FixtureProviderOptions<T>) {}

  protected async load(context: ProviderContext): Promise<T[]> {
    const cacheKey = `${this.options.name}:${context.now}:${context.windowHours}:${context.regionIds.join(',')}`;
    const ttlSeconds = this.options.ttlSeconds ?? 60;

    if (this.options.cache) {
      const cached = await this.options.cache.get<T[]>(cacheKey);
      if (cached) return cached;
    }

    const result = await withRetry(this.options.name, async () => this.options.loader(context), this.options.logger);
    if (this.options.cache) {
      await this.options.cache.set(cacheKey, result, ttlSeconds);
    }
    return result;
  }
}

export class OpenSkyTrackProvider extends BaseFixtureProvider<ProviderTrackObservation> implements TrackProvider {
  readonly name = this.options.name;
  async fetch(context: ProviderContext): Promise<ProviderTrackObservation[]> {
    const items = await this.load(context);
    return items.map((item) => ({ ...item, observedAt: toUtcIso(item.observedAt), provider: this.name }));
  }
}

export class AdsbExchangeTrackProvider extends BaseFixtureProvider<ProviderTrackObservation> implements TrackProvider {
  readonly name = this.options.name;
  async fetch(context: ProviderContext): Promise<ProviderTrackObservation[]> {
    const items = await this.load(context);
    return items.map((item) => ({ ...item, observedAt: toUtcIso(item.observedAt), provider: this.name }));
  }
}

export class FlightAwareCompatibleTrackProvider extends BaseFixtureProvider<ProviderTrackObservation> implements TrackProvider {
  readonly name = this.options.name;
  async fetch(context: ProviderContext): Promise<ProviderTrackObservation[]> {
    const items = await this.load(context);
    return items.map((item) => ({ ...item, observedAt: toUtcIso(item.observedAt), provider: this.name }));
  }
}

export class NotamRestrictionProvider extends BaseFixtureProvider<AirspaceRestriction> implements RestrictionProvider {
  readonly name = this.options.name;
  async fetch(context: ProviderContext): Promise<AirspaceRestriction[]> {
    const items = await this.load(context);
    return items.map((item) => ({ ...item, observedAt: toUtcIso(item.observedAt), expiresAt: item.expiresAt ? toUtcIso(item.expiresAt) : undefined, provider: this.name }));
  }
}

export class BulletinConflictProvider extends BaseFixtureProvider<ConflictIndicator> implements ConflictProvider {
  readonly name = this.options.name;
  async fetch(context: ProviderContext): Promise<ConflictIndicator[]> {
    const items = await this.load(context);
    return items.map((item) => ({ ...item, observedAt: toUtcIso(item.observedAt), expiresAt: item.expiresAt ? toUtcIso(item.expiresAt) : undefined, provider: this.name }));
  }
}

export class FirmsThermalProvider extends BaseFixtureProvider<ConflictIndicator> implements ConflictProvider {
  readonly name = this.options.name;
  async fetch(context: ProviderContext): Promise<ConflictIndicator[]> {
    const items = await this.load(context);
    return items.map((item) => ({ ...item, observedAt: toUtcIso(item.observedAt), expiresAt: item.expiresAt ? toUtcIso(item.expiresAt) : undefined, provider: this.name }));
  }
}

export class OsintNewsProvider extends BaseFixtureProvider<ConflictIndicator> implements ConflictProvider {
  readonly name = this.options.name;
  async fetch(context: ProviderContext): Promise<ConflictIndicator[]> {
    const items = await this.load(context);
    return items.map((item) => ({ ...item, observedAt: toUtcIso(item.observedAt), expiresAt: item.expiresAt ? toUtcIso(item.expiresAt) : undefined, provider: this.name }));
  }
}

import { Gauge, Registry } from 'prom-client';
import type { MonitoringSnapshot } from '../../../../packages/core/src';

export const registry = new Registry();

const ingestionLagGauge = new Gauge({ name: 'geo_ingestion_lag_seconds', help: 'End-to-end ingestion lag in seconds', registers: [registry] });
const providerFailuresGauge = new Gauge({ name: 'geo_provider_failures_total', help: 'Provider failures observed during the last build cycle', registers: [registry] });
const dedupeRateGauge = new Gauge({ name: 'geo_dedupe_rate_ratio', help: 'Fraction of raw observations removed during dedupe', registers: [registry] });
const eventVolumeGauge = new Gauge({ name: 'geo_event_volume_total', help: 'Current inferred event count', registers: [registry] });

export const updateMetricsFromSnapshot = (snapshot: MonitoringSnapshot): void => {
  ingestionLagGauge.set(snapshot.stats.ingestionLagSeconds);
  providerFailuresGauge.set(snapshot.stats.providerFailures);
  dedupeRateGauge.set(snapshot.stats.dedupeRate);
  eventVolumeGauge.set(snapshot.stats.eventVolume);
};

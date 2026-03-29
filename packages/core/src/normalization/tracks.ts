import { minuteBucket } from '../utils/time';
import type { FlightTrack, ProviderTrackObservation, RegionDefinition, TrackAnomaly, TrackPoint } from '../types/domain';
import { pointInPolygon } from '../geo/geometry';
import { haversineKm } from '../utils/distance';

interface GroupedObservation extends ProviderTrackObservation {
  providers: Set<string>;
}

const altitudeDeltaThresholdFt = 4500;
const transponderGapMinutes = 25;
const holdingPatternRadiusKm = 18;

export const deduplicateTrackObservations = (observations: ProviderTrackObservation[]): { deduped: ProviderTrackObservation[]; dedupeRate: number } => {
  const grouped = new Map<string, GroupedObservation>();

  for (const observation of observations) {
    const key = [observation.icao24, minuteBucket(observation.observedAt, 5), observation.callsign ?? 'unknown'].join(':');
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...observation, providers: new Set([observation.provider]) });
      continue;
    }

    existing.providers.add(observation.provider);
    const currentScore = [existing.altitudeFt, existing.heading, existing.speedKts, existing.origin, existing.destination].filter(Boolean).length;
    const candidateScore = [observation.altitudeFt, observation.heading, observation.speedKts, observation.origin, observation.destination].filter(Boolean).length;

    if (candidateScore > currentScore) {
      grouped.set(key, { ...observation, providers: existing.providers });
    }
  }

  const deduped = Array.from(grouped.values()).map(({ providers: _providers, ...observation }) => observation);
  const dedupeRate = observations.length === 0 ? 0 : 1 - deduped.length / observations.length;
  return { deduped, dedupeRate };
};

const collectRegionIds = (points: TrackPoint[], regions: RegionDefinition[]): string[] => {
  const regionIds = new Set<string>();
  for (const point of points) {
    const candidate = { type: 'Point' as const, coordinates: [point.longitude, point.latitude] as [number, number] };
    for (const region of regions) {
      if (pointInPolygon(candidate, region.geometry)) {
        regionIds.add(region.id);
      }
    }
  }
  return [...regionIds];
};

const detectAnomalies = (points: TrackPoint[], regionIds: string[]): TrackAnomaly[] => {
  const anomalies: TrackAnomaly[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const timeGapMinutes = (new Date(current.observedAt).getTime() - new Date(previous.observedAt).getTime()) / 60000;

    if (current.altitudeFt !== undefined && previous.altitudeFt !== undefined) {
      const deltaAlt = Math.abs(current.altitudeFt - previous.altitudeFt);
      if (timeGapMinutes <= 10 && deltaAlt >= altitudeDeltaThresholdFt) {
        anomalies.push({
          type: 'abrupt_altitude_change',
          observedAt: current.observedAt,
          severity: deltaAlt > 8000 ? 'high' : 'medium',
          explanation: `Altitude shifted by ${deltaAlt} ft within ${Math.round(timeGapMinutes)} minutes`,
          relatedRegionIds: regionIds,
          point: { type: 'Point', coordinates: [current.longitude, current.latitude] }
        });
      }
    }

    if (timeGapMinutes >= transponderGapMinutes) {
      anomalies.push({
        type: 'transponder_loss',
        observedAt: current.observedAt,
        severity: timeGapMinutes > 40 ? 'high' : 'medium',
        explanation: `Signal gap of ${Math.round(timeGapMinutes)} minutes detected between observations`,
        relatedRegionIds: regionIds,
        point: { type: 'Point', coordinates: [current.longitude, current.latitude] }
      });
    }

    if (previous.heading !== undefined && current.heading !== undefined) {
      const headingDelta = Math.abs(current.heading - previous.heading);
      if (headingDelta > 70 && timeGapMinutes <= 15) {
        anomalies.push({
          type: 'route_deviation',
          observedAt: current.observedAt,
          severity: headingDelta > 120 ? 'high' : 'medium',
          explanation: `Heading changed by ${Math.round(headingDelta)}° over ${Math.round(timeGapMinutes)} minutes`,
          relatedRegionIds: regionIds,
          point: { type: 'Point', coordinates: [current.longitude, current.latitude] }
        });
      }
    }
  }

  if (points.length >= 4) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const radiusKm = haversineKm(first.latitude, first.longitude, last.latitude, last.longitude);
    if (radiusKm <= holdingPatternRadiusKm) {
      anomalies.push({
        type: 'holding_pattern',
        observedAt: last.observedAt,
        severity: 'medium',
        explanation: `Track loop stayed within ${radiusKm.toFixed(1)} km radius`,
        relatedRegionIds: regionIds,
        point: { type: 'Point', coordinates: [last.longitude, last.latitude] }
      });
    }
  }

  return anomalies;
};

export const buildFlightTracks = (observations: ProviderTrackObservation[], regions: RegionDefinition[]): FlightTrack[] => {
  const grouped = new Map<string, ProviderTrackObservation[]>();
  for (const observation of observations) {
    const key = observation.icao24;
    const bucket = grouped.get(key) ?? [];
    bucket.push(observation);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries()).map(([icao24, group]) => {
    const points: TrackPoint[] = [...group]
      .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime())
      .map((observation) => ({
        observedAt: observation.observedAt,
        latitude: observation.latitude,
        longitude: observation.longitude,
        altitudeFt: observation.altitudeFt,
        heading: observation.heading,
        speedKts: observation.speedKts,
        provider: observation.provider,
        sourcePayloadId: observation.sourcePayloadId
      }));

    const regionIds = collectRegionIds(points, regions);
    const anomalies = detectAnomalies(points, regionIds);

    const first = group[0]!;
    const last = group[group.length - 1]!;

    return {
      id: `track-${icao24}`,
      icao24,
      callsign: first.callsign,
      squawk: first.squawk,
      origin: first.origin,
      destination: first.destination,
      aircraftType: first.aircraftType,
      providers: [...new Set(group.map((item) => item.provider))],
      startTime: points[0]!.observedAt,
      endTime: points[points.length - 1]!.observedAt,
      points,
      anomalies,
      regionIds
    };
  });
};

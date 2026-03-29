import { pointInBoundingBox } from '../../../../packages/core/src';
import type { AirspaceRestriction, InferredEvent, MonitoringSnapshot, SnapshotQuery, FlightTrack } from '../../../../packages/core/src';
import { isWithinRange } from '../../../../packages/core/src';

const trackMatchesAltitudeBand = (track: FlightTrack, query: SnapshotQuery): boolean => {
  if (!query.altitudeBand?.min && !query.altitudeBand?.max) return true;
  return track.points.some((point) => {
    const altitude = point.altitudeFt ?? 0;
    if (query.altitudeBand?.min !== undefined && altitude < query.altitudeBand.min) return false;
    if (query.altitudeBand?.max !== undefined && altitude > query.altitudeBand.max) return false;
    return true;
  });
};

const trackMatchesBBox = (track: FlightTrack, query: SnapshotQuery): boolean => {
  if (!query.bbox) return true;
  return track.points.some((point) => pointInBoundingBox({ type: 'Point', coordinates: [point.longitude, point.latitude] }, query.bbox!));
};

const eventMatchesBBox = (event: InferredEvent, query: SnapshotQuery): boolean => {
  if (!query.bbox) return true;
  if (event.geometry.type === 'Point') {
    return pointInBoundingBox(event.geometry, query.bbox);
  }
  const ring = event.geometry.coordinates[0];
  if (!ring) return false;
  return ring.some(([lon, lat]) => pointInBoundingBox({ type: 'Point', coordinates: [lon, lat] }, query.bbox!));
};

export const queryTracks = (snapshot: MonitoringSnapshot, query: SnapshotQuery): FlightTrack[] =>
  snapshot.tracks.filter((track) => {
    if (query.region && !track.regionIds.includes(query.region)) return false;
    if (!trackMatchesAltitudeBand(track, query)) return false;
    if (!trackMatchesBBox(track, query)) return false;
    if (query.sourceType && !track.providers.includes(query.sourceType)) return false;
    const overlapsWindow = (!query.start || new Date(track.endTime).getTime() >= new Date(query.start).getTime()) &&
      (!query.end || new Date(track.startTime).getTime() <= new Date(query.end).getTime());
    return overlapsWindow;
  });

export const queryEvents = (snapshot: MonitoringSnapshot, query: SnapshotQuery): InferredEvent[] =>
  snapshot.events.filter((event) => {
    if (query.region && !event.regionIds.includes(query.region)) return false;
    if (query.minConfidence !== undefined && event.confidence < query.minConfidence) return false;
    if (query.sourceType && !event.sourceProviders.includes(query.sourceType)) return false;
    if (!eventMatchesBBox(event, query)) return false;
    return isWithinRange(event.startedAt, query.start, query.end) || isWithinRange(event.endedAt, query.start, query.end);
  });

export const queryRestrictions = (snapshot: MonitoringSnapshot, query: SnapshotQuery): AirspaceRestriction[] =>
  snapshot.restrictions.filter((restriction) => {
    if (query.region && !restriction.regionIds.includes(query.region)) return false;
    return isWithinRange(restriction.observedAt, query.start, query.end);
  });

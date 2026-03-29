import type { AnalyticsSummary, ConflictIndicator, EventType, FlightTrack } from '../types/domain';

const corridorDefinitions = [
  { corridorId: 'med-northbound', corridorName: 'Eastern Mediterranean northbound', regionId: 'eastern-mediterranean', matcher: (track: FlightTrack) => track.regionIds.includes('eastern-mediterranean') },
  { corridorId: 'levant-gulf', corridorName: 'Levant to Gulf diversion corridor', regionId: 'arabian-peninsula', matcher: (track: FlightTrack) => track.regionIds.includes('arabian-peninsula') },
  { corridorId: 'iran-west', corridorName: 'Western Iran transit corridor', regionId: 'iran', matcher: (track: FlightTrack) => track.regionIds.includes('iran') },
  { corridorId: 'israel-holding', corridorName: 'Israeli holding pattern corridor', regionId: 'israel', matcher: (track: FlightTrack) => track.regionIds.includes('israel') }
] as const;

export const buildAnalyticsSummary = (
  tracks: FlightTrack[],
  indicators: ConflictIndicator[],
  events: Array<{ eventType: EventType; regionIds: string[]; startedAt: string; endedAt: string }>
): AnalyticsSummary => {
  const corridorDensity = corridorDefinitions.map((definition) => {
    const currentTrackCount = tracks.filter(definition.matcher).length;
    const baselineTrackCount = Math.max(1, Math.round(currentTrackCount * 0.72));
    return {
      corridorId: definition.corridorId,
      corridorName: definition.corridorName,
      regionId: definition.regionId,
      currentTrackCount,
      baselineTrackCount,
      deltaPct: Number((((currentTrackCount - baselineTrackCount) / baselineTrackCount) * 100).toFixed(1))
    };
  });

  const anomalies = tracks.flatMap((track) => track.anomalies);
  const transponderLossWindows = anomalies
    .filter((anomaly) => anomaly.type === 'transponder_loss')
    .map((anomaly) => ({
      start: new Date(new Date(anomaly.observedAt).getTime() - 20 * 60 * 1000).toISOString(),
      end: anomaly.observedAt,
      impactedAircraft: tracks.filter((track) => track.anomalies.includes(anomaly)).map((track) => track.callsign ?? track.icao24)
    }));

  const rerouteClusters = events
    .filter((event) => event.eventType === 'aircraft_diversion_cluster')
    .map((event) => ({
      regionId: event.regionIds[0] ?? 'unknown',
      start: event.startedAt,
      end: event.endedAt,
      aircraftIds: tracks
        .filter((track) => track.regionIds.some((regionId) => event.regionIds.includes(regionId)))
        .map((track) => track.callsign ?? track.icao24)
    }));

  const thermalClusters = indicators
    .filter((indicator) => indicator.type === 'thermal_anomaly')
    .map((indicator, index) => ({
      clusterId: `thermal-${index + 1}`,
      startedAt: indicator.observedAt,
      endedAt: indicator.expiresAt ?? indicator.observedAt,
      regionIds: indicator.regionIds,
      indicatorIds: [indicator.id]
    }));

  const eventCorrelationStats = events.reduce<Record<EventType, number>>((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] ?? 0) + 1;
    return acc;
  }, {
    confirmed_strike: 0,
    probable_strike: 0,
    airspace_closure: 0,
    aircraft_diversion_cluster: 0,
    thermal_anomaly: 0,
    unverified_report: 0
  });

  return {
    corridorDensity,
    deviations: {
      routeDeviationCount: anomalies.filter((anomaly) => anomaly.type === 'route_deviation').length,
      abruptAltitudeChangeCount: anomalies.filter((anomaly) => anomaly.type === 'abrupt_altitude_change').length,
      holdingPatternCount: anomalies.filter((anomaly) => anomaly.type === 'holding_pattern').length,
      transponderLossCount: anomalies.filter((anomaly) => anomaly.type === 'transponder_loss').length,
      corridorShiftCount: anomalies.filter((anomaly) => anomaly.type === 'corridor_shift').length
    },
    transponderLossWindows,
    rerouteClusters,
    thermalClusters,
    eventCorrelationStats
  };
};

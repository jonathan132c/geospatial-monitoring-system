import { v4 as uuidv4 } from 'uuid';
import type {
  AirspaceRestriction,
  ConflictIndicator,
  EventEvidence,
  EventType,
  FlightTrack,
  InferredEvent,
  RegionDefinition,
  SupportedGeometry
} from '../types/domain';
import { buildReasoning } from '../scoring/confidence';
import { haversineKm } from '../utils/distance';

const pointCoordinates = (geometry: SupportedGeometry): [number, number] =>
  geometry.type === 'Point' ? geometry.coordinates : geometry.coordinates[0]![0]!;

const asEvidence = (provider: string, sourceType: EventEvidence['sourceType'], sourcePayloadId: string, summary: string, observedAt: string): EventEvidence => ({
  provider,
  sourceType,
  sourcePayloadId,
  summary,
  observedAt
});

const dedupeEvidence = (items: EventEvidence[]): EventEvidence[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.provider}:${item.sourcePayloadId}:${item.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const groupThermalIndicators = (indicators: ConflictIndicator[]): ConflictIndicator[][] => {
  const thermals = indicators.filter((indicator) => indicator.type === 'thermal_anomaly').sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  const groups: ConflictIndicator[][] = [];

  for (const indicator of thermals) {
    const [lon, lat] = pointCoordinates(indicator.geometry);
    const existing = groups.find((group) => {
      const anchor = group[0]!;
      const [anchorLon, anchorLat] = pointCoordinates(anchor.geometry);
      const withinDistance = haversineKm(lat, lon, anchorLat, anchorLon) <= 35;
      const withinTime = Math.abs(new Date(indicator.observedAt).getTime() - new Date(anchor.observedAt).getTime()) <= 90 * 60 * 1000;
      return withinDistance && withinTime;
    });

    if (existing) {
      existing.push(indicator);
    } else {
      groups.push([indicator]);
    }
  }

  return groups;
};

const detectDiversionClusters = (tracks: FlightTrack[]): Array<{ geometry: SupportedGeometry; tracks: FlightTrack[]; observedAt: string }> => {
  const flagged = tracks.flatMap((track) =>
    track.anomalies
      .filter((anomaly) => ['route_deviation', 'transponder_loss', 'corridor_shift'].includes(anomaly.type))
      .map((anomaly) => ({ track, anomaly }))
  );

  const clusters: Array<{ geometry: SupportedGeometry; tracks: FlightTrack[]; observedAt: string }> = [];

  for (const item of flagged) {
    if (!item.anomaly.point) continue;
    const [lon, lat] = item.anomaly.point.coordinates;
    const existing = clusters.find((cluster) => {
      const [anchorLon, anchorLat] = pointCoordinates(cluster.geometry);
      return haversineKm(lat, lon, anchorLat, anchorLon) <= 80;
    });

    if (existing) {
      if (!existing.tracks.some((track) => track.id === item.track.id)) {
        existing.tracks.push(item.track);
      }
    } else {
      clusters.push({ geometry: item.anomaly.point, tracks: [item.track], observedAt: item.anomaly.observedAt });
    }
  }

  return clusters.filter((cluster) => cluster.tracks.length >= 2);
};

const eventTypeFromReasoning = (score: number, hasOfficial: boolean): EventType => {
  if (score >= 0.85 && hasOfficial) return 'confirmed_strike';
  return 'probable_strike';
};

export const correlateEvents = (
  tracks: FlightTrack[],
  indicators: ConflictIndicator[],
  restrictions: AirspaceRestriction[],
  regions: RegionDefinition[]
): InferredEvent[] => {
  const events: InferredEvent[] = [];
  const diversionClusters = detectDiversionClusters(tracks);
  const thermalClusters = groupThermalIndicators(indicators);
  const reports = indicators.filter((indicator) => indicator.type === 'osint_report' || indicator.type === 'news_report');
  const bulletins = indicators.filter((indicator) => indicator.type === 'icao_bulletin' || indicator.type === 'easa_bulletin');

  for (const restriction of restrictions) {
    events.push({
      id: `event-${restriction.id}`,
      eventType: 'airspace_closure',
      startedAt: restriction.observedAt,
      endedAt: restriction.expiresAt ?? restriction.observedAt,
      geometry: restriction.geometry,
      regionIds: restriction.regionIds,
      sourceProviders: [restriction.provider],
      evidence: [asEvidence(restriction.provider, 'restriction', restriction.sourcePayloadId, restriction.summary, restriction.observedAt)],
      confidence: restriction.restrictionLevel === 'closure' ? 0.9 : 0.7,
      reasoning: {
        score: restriction.restrictionLevel === 'closure' ? 0.9 : 0.7,
        confidenceLabel: 'high',
        signals: [{ label: 'Official restriction', effect: 'increase', weight: 0.7, evidence: restriction.title }],
        explanation: 'Restriction originates from a formal advisory or closure source.'
      },
      title: restriction.title,
      summary: restriction.summary
    });
  }

  thermalClusters.forEach((cluster, index) => {
    const startedAt = cluster[0]!.observedAt;
    const endedAt = cluster[cluster.length - 1]!.observedAt;
    events.push({
      id: `event-thermal-${index + 1}`,
      eventType: 'thermal_anomaly',
      startedAt,
      endedAt,
      geometry: cluster[0]!.geometry,
      regionIds: [...new Set(cluster.flatMap((indicator) => indicator.regionIds))],
      sourceProviders: [...new Set(cluster.map((indicator) => indicator.provider))],
      evidence: cluster.map((indicator) => asEvidence(indicator.provider, indicator.type, indicator.sourcePayloadId, indicator.headline, indicator.observedAt)),
      confidence: cluster.length >= 2 ? 0.62 : 0.44,
      reasoning: {
        score: cluster.length >= 2 ? 0.62 : 0.44,
        confidenceLabel: cluster.length >= 2 ? 'moderate' : 'low',
        signals: [{ label: 'Thermal cluster', effect: 'increase', weight: 0.22, evidence: `${cluster.length} thermals clustered.` }],
        explanation: 'Thermal anomalies alone are not sufficient to imply a confirmed strike.'
      },
      title: `Thermal anomaly cluster ${index + 1}`,
      summary: `${cluster.length} thermal anomalies clustered within ~35 km / 90 minutes.`
    });
  });

  reports.forEach((report) => {
    if (report.independentSourceCount <= 1) {
      events.push({
        id: `event-unverified-${report.id}`,
        eventType: 'unverified_report',
        startedAt: report.observedAt,
        endedAt: report.expiresAt ?? report.observedAt,
        geometry: report.geometry,
        regionIds: report.regionIds,
        sourceProviders: [report.provider],
        evidence: [asEvidence(report.provider, report.type, report.sourcePayloadId, report.headline, report.observedAt)],
        confidence: 0.2,
        reasoning: {
          score: 0.2,
          confidenceLabel: 'low',
          signals: [{ label: 'Single-source report', effect: 'decrease', weight: 0.2, evidence: report.headline }],
          explanation: 'Preserved for visibility, but unverified due to weak sourcing.'
        },
        title: report.headline,
        summary: report.description
      });
    }
  });

  thermalClusters.forEach((cluster, clusterIndex) => {
    const geometry = cluster[0]!.geometry;
    const [lon, lat] = pointCoordinates(geometry);
    const nearbyReports = reports.filter((report) => {
      const [reportLon, reportLat] = pointCoordinates(report.geometry);
      return haversineKm(lat, lon, reportLat, reportLon) <= 60;
    });
    const nearbyRestrictions = restrictions.filter((restriction) => {
      const [restrictionLon, restrictionLat] = pointCoordinates(restriction.geometry);
      return haversineKm(lat, lon, restrictionLat, restrictionLon) <= 80;
    });
    const nearbyBulletins = bulletins.filter((bulletin) => {
      const [bulletinLon, bulletinLat] = pointCoordinates(bulletin.geometry);
      return haversineKm(lat, lon, bulletinLat, bulletinLon) <= 140;
    });
    const nearbyDiversions = diversionClusters.filter((clustered) => {
      const [dLon, dLat] = pointCoordinates(clustered.geometry);
      return haversineKm(lat, lon, dLat, dLon) <= 120;
    });

    const reasoning = buildReasoning({
      hasOfficialRestriction: nearbyRestrictions.length > 0,
      hasConflictBulletin: nearbyBulletins.length > 0,
      thermalClusterCount: cluster.length,
      independentReportCount: nearbyReports.reduce((acc, report) => acc + report.independentSourceCount, 0),
      diversionCount: nearbyDiversions.reduce((acc, clusterItem) => acc + clusterItem.tracks.length, 0),
      temporalAlignment: nearbyReports.some((report) => Math.abs(new Date(report.observedAt).getTime() - new Date(cluster[0]!.observedAt).getTime()) <= 90 * 60 * 1000),
      singleWeakSource: nearbyReports.length === 1 && nearbyReports[0]!.independentSourceCount < 2
    });

    const type = eventTypeFromReasoning(reasoning.score, nearbyRestrictions.length > 0);
    if (reasoning.score < 0.45) return;

    const evidence: EventEvidence[] = dedupeEvidence([
      ...cluster.map((indicator) => asEvidence(indicator.provider, indicator.type, indicator.sourcePayloadId, indicator.headline, indicator.observedAt)),
      ...nearbyReports.map((report) => asEvidence(report.provider, report.type, report.sourcePayloadId, report.headline, report.observedAt)),
      ...nearbyRestrictions.map((restriction) => asEvidence(restriction.provider, 'restriction', restriction.sourcePayloadId, restriction.summary, restriction.observedAt)),
      ...nearbyDiversions.flatMap((clustered) =>
        clustered.tracks.map((track) =>
          asEvidence(track.providers[0] ?? 'unknown', 'track', track.points[0]!.sourcePayloadId, `${track.callsign ?? track.icao24} shows reroute/transponder anomaly`, clustered.observedAt)
        )
      )
    ]);

    const titlePrefix = type === 'confirmed_strike' ? 'Confirmed strike candidate' : 'Probable strike candidate';
    const regionIds = [...new Set(cluster.flatMap((indicator) => indicator.regionIds))];

    events.push({
      id: `event-strike-${clusterIndex + 1}`,
      eventType: type,
      startedAt: cluster[0]!.observedAt,
      endedAt: cluster[cluster.length - 1]!.observedAt,
      geometry,
      regionIds,
      sourceProviders: [...new Set(evidence.map((item) => item.provider))],
      evidence,
      confidence: reasoning.score,
      reasoning,
      title: `${titlePrefix} ${clusterIndex + 1}`,
      summary: `${titlePrefix} built from thermal clustering, independent reports, and nearby flight anomalies.`
    });
  });

  diversionClusters.forEach((cluster, index) => {
    events.push({
      id: `event-diversion-${uuidv4()}`,
      eventType: 'aircraft_diversion_cluster',
      startedAt: cluster.observedAt,
      endedAt: cluster.observedAt,
      geometry: cluster.geometry,
      regionIds: [...new Set(cluster.tracks.flatMap((track) => track.regionIds))],
      sourceProviders: [...new Set(cluster.tracks.flatMap((track) => track.providers))],
      evidence: dedupeEvidence(cluster.tracks.map((track) =>
        asEvidence(track.providers[0] ?? 'unknown', 'track', track.points[0]!.sourcePayloadId, `${track.callsign ?? track.icao24} contributed to diversion cluster`, cluster.observedAt)
      )),
      confidence: 0.55,
      reasoning: {
        score: 0.55,
        confidenceLabel: 'moderate',
        signals: [{ label: 'Clustered reroutes', effect: 'increase', weight: 0.18, evidence: `${cluster.tracks.length} aircraft share anomalies near the same zone.` }],
        explanation: 'Useful conflict proxy, but not enough by itself to confirm a strike.'
      },
      title: `Diversion cluster ${index + 1}`,
      summary: `${cluster.tracks.length} aircraft show reroute/transponder-loss behaviour in the same corridor.`
    });
  });

  return events.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
};

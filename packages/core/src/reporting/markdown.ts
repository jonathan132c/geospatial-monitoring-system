import type { MonitoringSnapshot } from '../types/domain';

const eventTypeLabel = (eventType: string): string => {
  switch (eventType) {
    case 'confirmed_strike': return 'Historically corroborated public-source event candidate';
    case 'probable_strike': return 'Probabilistic public-source event candidate';
    case 'airspace_closure': return 'Public airspace restriction';
    case 'aircraft_diversion_cluster': return 'Aircraft diversion cluster';
    case 'thermal_anomaly': return 'Thermal anomaly cluster';
    case 'unverified_report': return 'Unverified public-source report';
    default: return eventType;
  }
};

const buildSourceModeNotice = (snapshot: MonitoringSnapshot): string => {
  if (snapshot.sourceMetadata.mode === 'live') {
    return `> Safety boundary: non-operational public-source analytical output only. This report is generated from genuinely implemented live public inputs only; unsupported providers remain disabled and live mode never falls back to fixtures. Active live providers: ${snapshot.sourceMetadata.activeProviders.join(', ') || 'none'}.`;
  }

  return '> Safety boundary: non-operational public-source analytical output only. This report is based on seeded/demo and historical-style public-source inputs, not live tactical feeds.';
};

export const buildReportMarkdown = (snapshot: MonitoringSnapshot): string => {
  const topEvents = snapshot.events.slice(0, 5);
  const corridorRows = snapshot.analytics.corridorDensity
    .map((corridor) => `| ${corridor.corridorName} | ${corridor.currentTrackCount} | ${corridor.baselineTrackCount} | ${corridor.deltaPct}% |`)
    .join('\n');

  const eventSections = topEvents.length === 0
    ? 'No events were inferred for this snapshot.'
    : topEvents
      .map((event) => {
        const evidence = event.evidence.map((item) => `- ${item.observedAt} — ${item.provider}: ${item.summary}`).join('\n');
        const reasoning = event.reasoning.signals
          .map((signal) => `- ${signal.effect === 'increase' ? '+' : '-'}${signal.weight.toFixed(2)} ${signal.label}: ${signal.evidence}`)
          .join('\n');
        return `## ${eventTypeLabel(event.eventType)}\n- Type: ${eventTypeLabel(event.eventType)}\n- Confidence: ${event.confidence}\n- Window: ${event.startedAt} → ${event.endedAt}\n- Regions: ${event.regionIds.join(', ')}\n\n### Evidence\n${evidence}\n\n### Reasoning\n${reasoning}`;
      })
      .join('\n\n');

  const providerStatusLines = snapshot.sourceMetadata.providerStatuses
    .map((status) => `- ${status.provider}: ${status.status} (${status.recordCount} records, ${status.rawPayloadCount} raw payloads)${status.reason ? ` — ${status.reason}` : ''}`)
    .join('\n');

  return `# Historical public-source analytical monitoring report\n\nGenerated at: ${snapshot.generatedAt}\nWindow: last ${snapshot.windowHours} hours (UTC normalized)\nSource mode: ${snapshot.sourceMetadata.mode}\nLive data present: ${snapshot.sourceMetadata.liveData ? 'yes' : 'no'}\n\n${buildSourceModeNotice(snapshot)} Geometry presented through the public app/API is intended to be delayed/coarsened for research, journalistic, or humanitarian situational awareness.\n>
> Disclaimer: event inference in this system is probabilistic and must not be treated as authoritative confirmation unless validated by authoritative sources. No precision strike attribution, no direct missile-tracking claims, and no live tactical guidance are provided.\n\n## Snapshot summary\n- Tracks: ${snapshot.tracks.length}\n- Indicators: ${snapshot.indicators.length}\n- Events: ${snapshot.events.length}\n- Dedupe rate: ${(snapshot.stats.dedupeRate * 100).toFixed(1)}%\n- Provider failures: ${snapshot.stats.providerFailures}\n\n## Provider status\n${providerStatusLines}\n\n## Corridor density\n| Corridor | Current tracks | Baseline tracks | Delta |\n| --- | ---: | ---: | ---: |\n${corridorRows}\n\n## Deviation summary\n- Route deviations: ${snapshot.analytics.deviations.routeDeviationCount}\n- Abrupt altitude changes: ${snapshot.analytics.deviations.abruptAltitudeChangeCount}\n- Holding patterns: ${snapshot.analytics.deviations.holdingPatternCount}\n- Transponder-loss windows: ${snapshot.analytics.deviations.transponderLossCount}\n- Corridor shifts: ${snapshot.analytics.deviations.corridorShiftCount}\n\n## Event mix\n${Object.entries(snapshot.analytics.eventCorrelationStats)
  .map(([key, value]) => `- ${eventTypeLabel(key)}: ${value}`)
  .join('\n')}\n\n## Top events\n\n${eventSections}\n`;
};

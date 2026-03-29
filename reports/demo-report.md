# Historical public-source analytical monitoring report

Generated at: 2026-03-29T00:00:00.000Z
Window: last 72 hours (UTC normalized)

> Safety boundary: non-operational public-source analytical output only. This report is based on seeded/demo and historical-style public-source inputs, not live tactical feeds. Geometry presented through the public app/API is intended to be delayed/coarsened for research, journalistic, or humanitarian situational awareness.
>
> Disclaimer: event inference in this system is probabilistic and must not be treated as authoritative confirmation unless validated by authoritative sources. No precision strike attribution, no direct missile-tracking claims, and no live tactical guidance are provided.

## Snapshot summary
- Tracks: 7
- Indicators: 11
- Events: 8
- Dedupe rate: 9.4%
- Provider failures: 0

## Corridor density
| Corridor | Current tracks | Baseline tracks | Delta |
| --- | ---: | ---: | ---: |
| Eastern Mediterranean northbound | 3 | 2 | 50% |
| Levant to Gulf diversion corridor | 4 | 3 | 33.3% |
| Western Iran transit corridor | 3 | 2 | 50% |
| Israeli holding pattern corridor | 3 | 2 | 50% |

## Deviation summary
- Route deviations: 6
- Abrupt altitude changes: 2
- Holding patterns: 2
- Transponder-loss windows: 5
- Corridor shifts: 0

## Event mix
- Historically corroborated public-source event candidate: 1
- Probabilistic public-source event candidate: 1
- Public airspace restriction: 2
- Aircraft diversion cluster: 1
- Thermal anomaly cluster: 2
- Unverified public-source report: 1

## Top events

## Thermal anomaly cluster
- Type: Thermal anomaly cluster
- Confidence: 0.62
- Window: 2026-03-28T19:22:00.000Z → 2026-03-28T19:46:00.000Z
- Regions: israel

### Evidence
- 2026-03-28T19:22:00.000Z — nasa_firms: FIRMS thermal hit thermal-4
- 2026-03-28T19:46:00.000Z — nasa_firms: FIRMS thermal hit thermal-5

### Reasoning
- +0.22 Thermal cluster: 2 thermals clustered.

## Probabilistic public-source event candidate
- Type: Probabilistic public-source event candidate
- Confidence: 0.52
- Window: 2026-03-28T19:22:00.000Z → 2026-03-28T19:46:00.000Z
- Regions: israel

### Evidence
- 2026-03-28T19:22:00.000Z — nasa_firms: FIRMS thermal hit thermal-4
- 2026-03-28T19:46:00.000Z — nasa_firms: FIRMS thermal hit thermal-5
- 2026-03-28T19:38:00.000Z — osint_news: Two independent reports mention flashes near the southern Israeli corridor

### Reasoning
- +0.22 Thermal anomaly clustering: 2 thermal indicator(s) clustered by time and distance.
- +0.12 Multiple independent reports: 2 independent reports corroborate the event.
- +0.10 Temporal clustering: Indicators align within a narrow time window.

## Thermal anomaly cluster
- Type: Thermal anomaly cluster
- Confidence: 0.62
- Window: 2026-03-28T17:41:00.000Z → 2026-03-28T18:18:00.000Z
- Regions: eastern-mediterranean

### Evidence
- 2026-03-28T17:41:00.000Z — nasa_firms: FIRMS thermal hit thermal-1
- 2026-03-28T18:02:00.000Z — nasa_firms: FIRMS thermal hit thermal-2
- 2026-03-28T18:18:00.000Z — nasa_firms: FIRMS thermal hit thermal-3

### Reasoning
- +0.22 Thermal cluster: 3 thermals clustered.

## Historically corroborated public-source event candidate
- Type: Historically corroborated public-source event candidate
- Confidence: 1
- Window: 2026-03-28T17:41:00.000Z → 2026-03-28T18:18:00.000Z
- Regions: eastern-mediterranean

### Evidence
- 2026-03-28T17:41:00.000Z — nasa_firms: FIRMS thermal hit thermal-1
- 2026-03-28T18:02:00.000Z — nasa_firms: FIRMS thermal hit thermal-2
- 2026-03-28T18:18:00.000Z — nasa_firms: FIRMS thermal hit thermal-3
- 2026-03-28T17:55:00.000Z — osint_news: Multiple local channels mention impact sounds east of Cyprus corridor
- 2026-03-28T18:10:00.000Z — osint_news: Regional desk reports emergency reroutes linked to suspected strike activity
- 2026-03-28T17:10:00.000Z — notam_feed: Seeded NOTAM-like closure affecting the Levantine maritime corridor.
- 2026-03-28T16:31:00.000Z — opensky: EM9001 shows reroute/transponder anomaly
- 2026-03-28T16:31:00.000Z — opensky: MEA440 shows reroute/transponder anomaly

### Reasoning
- +0.28 Official airspace restriction: Restriction or closure bulletin overlaps the event window and geometry.
- +0.24 Conflict-zone bulletin: Conflict-zone bulletin or safety advisory corroborates elevated risk.
- +0.26 Thermal anomaly clustering: 3 thermal indicator(s) clustered by time and distance.
- +0.18 Multiple independent reports: 4 independent reports corroborate the event.
- +0.14 Nearby diversion cluster: 2 affected aircraft show reroute/transponder anomalies nearby.
- +0.10 Temporal clustering: Indicators align within a narrow time window.

## Public airspace restriction
- Type: Public airspace restriction
- Confidence: 0.9
- Window: 2026-03-28T17:10:00.000Z → 2026-03-29T05:00:00.000Z
- Regions: eastern-mediterranean

### Evidence
- 2026-03-28T17:10:00.000Z — notam_feed: Seeded NOTAM-like closure affecting the Levantine maritime corridor.

### Reasoning
- +0.70 Official restriction: Temporary closure east of Cyprus / Levant corridor

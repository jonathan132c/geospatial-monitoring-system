# Database schema notes

## Core tables
- `providers`: provider registry and adapter metadata.
- `regions`: built-in/custom polygons with cached bbox polygons and GeoJSON.
- `raw_source_payloads`: immutable audit trail of fetched payloads and attribution metadata.
- `track_observations`: provider-normalized point observations.
- `flight_tracks`: reconciled multi-point track summaries.
- `track_anomalies`: detected deviations, transponder gaps, holding patterns, etc.
- `conflict_indicators`: thermal hits, OSINT/news items, ICAO/EASA bulletins.
- `airspace_restrictions`: NOTAM/advisory/closure geometries.
- `inferred_events`: correlated strike/restriction/diversion/unverified events with reasoning JSON.
- `event_evidence`: source-to-event linkage for transparent inspection.
- `analytics_snapshots`: persisted rollups for reporting or time-series dashboards.

## Geospatial strategy
- Polygons, lines, and points use SRID 4326.
- `GIST` indexes support region intersection, bbox filtering, and map queries.
- A dedicated `bbox` polygon is stored for fast rectangular intersection shortcuts.

## Auditability
- Every normalized observation/indicator is traceable to a `raw_source_payloads` row.
- Event evidence references raw payload ids so the API/UI can explain why an event exists.
- Raw payloads are preserved locally for auditability, while public API exposure is intentionally summarized/coarsened for non-operational use.

## Rolling windows
- Query windows are 6h / 24h / 72h at the application layer.
- `active_event_windows` view provides a 72h convenience projection for operational dashboards.

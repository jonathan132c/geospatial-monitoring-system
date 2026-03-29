# Architecture overview

## Safety posture first
This build is intentionally **non-operational**.

Its intended use is limited to:
- public-source research
- journalism
- humanitarian situational awareness
- technical prototyping using explicit demo fixtures or honest live public-source outputs

It is not designed or documented as a real-time tactical targeting system. It does not provide live tactical guidance, precision strike attribution, or direct missile-tracking claims.

## Goals
- Fuse aircraft movement, airspace restrictions, thermal anomalies, and vetted reports across Iran, Israel, the Arabian Peninsula, and the Eastern Mediterranean.
- Distinguish aircraft tracks, public restrictions, probabilistic public-source event candidates, and weak-source/unverified reports.
- Preserve raw payloads locally for auditability while exposing safer summarized/coarsened public API views.

## Runtime topology
1. **Worker (`apps/worker`)**
   - Schedules ingestion cycles.
   - Calls provider adapters with retry/backoff and cache hooks.
   - Normalizes timestamps to UTC, deduplicates overlapping observations, correlates events, computes analytics.
   - Writes either `data/generated/demo-snapshot.json` or `data/generated/live-snapshot.json` depending on `SNAPSHOT_MODE`.
2. **API (`apps/api`)**
   - Serves REST endpoints for tracks, events, airspace restrictions, regions, health, and metrics.
   - Uses a file-backed repository in both demo and live snapshot modes.
   - Includes a scaffolded Postgres repository aligned to the provided PostGIS schema.
   - Adds public safety metadata, coarsens map geometry in public responses, and summarizes audit payload exposure.
3. **Frontend (`apps/web`)**
   - React + Leaflet map for tracks, restrictions, event markers, and evidence inspection.
   - Supports time window, altitude, region, source, aircraft type, and confidence filtering.
   - Prominently labels the dashboard as delayed/public-source/non-operational.
4. **Data stores**
   - **PostgreSQL + PostGIS**: canonical long-term storage schema, geospatial indexing, audit payload retention.
   - **Redis**: cache/short-lived provider state (wired through adapter interface; demo defaults to in-memory cache).
   - **Snapshot JSON**: either deterministic demo fixtures or honest live public data, depending on `SNAPSHOT_MODE`.

## Processing pipeline
- `providers/` fetch raw data behind interfaces.
- `normalization/` coerces provider output into shared DTOs and normalizes UTC timestamps.
- `normalization/tracks.ts` deduplicates overlapping observations by ICAO24 + time bucket and builds track objects.
- `correlation/events.ts` combines thermal clusters, reports, restrictions, bulletins, and aircraft anomalies into analytical event classes.
- `scoring/confidence.ts` emits a transparent reasoning object with additive/subtractive signals.
- `analytics/summary.ts` computes corridor density, deviation counts, transponder loss windows, reroute clusters, and event mix.
- `reporting/markdown.ts` renders a generated markdown brief that labels demo vs live inputs honestly.

## Reliability / observability
- Structured logs via Pino.
- Retry with exponential backoff for provider calls.
- Cache adapter abstraction (in-memory demo + Redis adapter).
- Prometheus metrics endpoint exposing ingestion lag, provider failures, dedupe rate, and event volume.
- Fail-closed geospatial validation for polygons/bboxes.
- Raw payload preservation for every ingested provider response, including live OpenSky snapshots.

## Honest status
- Demo flow works end-to-end without network access.
- Live flow works end-to-end for the public OpenSky current-state track feed.
- Because that live source is current-state only, live mode presently yields track snapshots without live restriction/indicator correlation.
- ADS-B Exchange, FlightAware, NOTAM feeds, ICAO/EASA bulletins, and automated live OSINT remain outside the active live path in this branch.
- NASA FIRMS is not enabled by default because its live API requires credentials (`MAP_KEY`).
- PostGIS schema/migrations are included and align to the runtime model, but file-backed JSON snapshots remain the default local runtime.
- Public UI/API output is intentionally safer than internal storage: delayed/coarsened, clearly labeled, and framed for research/journalistic/humanitarian use only.

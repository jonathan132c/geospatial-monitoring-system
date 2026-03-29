# Architecture overview

## Safety posture first
This build is intentionally **non-operational**.

Its intended use is limited to:
- public-source research
- journalism
- humanitarian situational awareness
- technical prototyping using seeded/demo or delayed analytical outputs

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
   - Writes a snapshot (`data/generated/demo-snapshot.json`) for offline/demo mode.
2. **API (`apps/api`)**
   - Serves REST endpoints for tracks, events, airspace restrictions, regions, health, and metrics.
   - Uses a file-backed repository in seeded/demo mode.
   - Includes a scaffolded Postgres repository aligned to the provided PostGIS schema.
   - Adds public safety metadata, coarsens map geometry in public responses, and summarizes audit payload exposure.
3. **Frontend (`apps/web`)**
   - React + Leaflet map for tracks, restrictions, event markers, and evidence inspection.
   - Supports time window, altitude, region, source, aircraft type, and confidence filtering.
   - Prominently labels the dashboard as delayed/public-source/non-operational.
4. **Data stores**
   - **PostgreSQL + PostGIS**: canonical long-term storage schema, geospatial indexing, audit payload retention.
   - **Redis**: cache/short-lived provider state (wired through adapter interface; demo defaults to in-memory cache).
   - **Snapshot JSON**: deterministic seeded/demo mode so the project works without credentials or live feeds.

## Processing pipeline
- `providers/` fetch raw data behind interfaces.
- `normalization/` coerces provider output into shared DTOs and normalizes UTC timestamps.
- `normalization/tracks.ts` deduplicates overlapping observations by ICAO24 + time bucket and builds track objects.
- `correlation/events.ts` combines thermal clusters, reports, restrictions, bulletins, and aircraft anomalies into analytical event classes.
- `scoring/confidence.ts` emits a transparent reasoning object with additive/subtractive signals.
- `analytics/summary.ts` computes corridor density, deviation counts, transponder loss windows, reroute clusters, and event mix.
- `reporting/markdown.ts` renders a generated markdown brief for seeded/demo output.

## Reliability / observability
- Structured logs via Pino.
- Retry with exponential backoff for provider calls.
- Cache adapter abstraction (in-memory demo + Redis adapter).
- Prometheus metrics endpoint exposing ingestion lag, provider failures, dedupe rate, and event volume.
- Fail-closed geospatial validation for polygons/bboxes.
- Raw payload preservation for every seeded provider record.

## Honest status
- Seeded/demo flow works end-to-end without network access.
- Live provider credentialed ingestion is scaffolded behind interfaces, not claimed as fully production-wired in this first implementation.
- PostGIS schema/migrations are included and align to the runtime model, but demo mode persists to a JSON snapshot for deterministic local use.
- Public UI/API output is intentionally safer than internal storage: delayed/coarsened, clearly labeled, and framed for research/journalistic/humanitarian use only.

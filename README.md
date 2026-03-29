# Geospatial Monitoring System (public-source analytical demo)

A standalone TypeScript geospatial monitoring project for **historical / delayed public-source analysis** across:
- Iran
- Israel
- the Arabian Peninsula
- the Eastern Mediterranean

It is organized as an isolated monorepo-style build under this folder only.

## Safety boundary / intended use
**This project is non-operational.**

It is intended for:
- research
- journalism
- humanitarian situational awareness
- technical prototyping of public-source analytical workflows

It is **not** intended for:
- live tactical guidance
- precision targeting
- direct missile tracking claims
- precision strike attribution
- operational command-and-control use

The implementation stays explicitly non-operational, but it is no longer demo-only at runtime:
- `demo` mode uses offline seeded fixtures for every provider.
- `live` mode uses only genuinely implemented live public sources and leaves unsupported providers disabled instead of faking them.

Public display outputs remain coarsened and uncertainty remains explicit in both modes.

## Important disclaimer
**Event inference in this system is probabilistic and must not be treated as authoritative confirmation unless validated by authoritative sources.**

The project deliberately separates:
- aircraft tracks from public/source-like feeds
- public airspace restrictions
- public-source analytical event candidates
- unverified weak-source reports

## What is implemented
- Fastify REST API with bounded, non-operational endpoint labeling
- React + Leaflet map UI with explicit non-operational banners and evidence inspection
- explicit snapshot modes: offline `demo` fixtures or honest `live` ingestion
- real live ingestion for the public OpenSky current-state track feed
- provider interfaces plus demo adapters for OpenSky / ADS-B Exchange / FlightAware-compatible track feeds, NOTAM-style restrictions, ICAO/EASA bulletins, NASA FIRMS, and vetted OSINT/news inputs
- UTC normalization, rolling windows (6h / 24h / 72h), polygon/bbox validation, and custom region creation
- track deduplication / reconciliation and anomaly detection
- public-source analytical event correlation and transparent confidence scoring
- structured logging, retry/backoff, cache abstraction, and Prometheus metrics
- PostgreSQL + PostGIS schema/migrations
- Docker Compose stack with Postgres/PostGIS, Redis, API, worker, and web services
- seeded demo data, unit tests, integration tests, and generated sample report

## What is scaffolded / honest limits
- `demo` mode remains the default and uses offline fixtures for every provider.
- `live` mode is honest by construction: it currently activates only the public OpenSky current-state track feed. There is **no** silent live→fixture fallback.
- ADS-B Exchange, FlightAware, NOTAM feeds, ICAO/EASA bulletins, and OSINT/news are not part of the active live path in this branch.
- NASA FIRMS remains off by default because its live API requires a `MAP_KEY`; this repo does not pretend that keyless access exists.
- PostGIS schema is production-oriented, but the running file-backed workflows persist to JSON snapshots so the project works without standing up the full DB layer.
- Public API/UI outputs are designed to be interpreted as delayed/coarsened analytical views, not exact operational geolocation products.
- This system does **not** claim military-grade certainty and does **not** elevate a single public report into authoritative confirmation.

## Project layout
See:
- `docs/architecture-overview.md`
- `docs/module-file-structure.md`
- `docs/database-schema.md`

## Quick start
```bash
npm install
cp .env.example .env  # optional
npm run seed:demo
npm run generate:report
npm run dev:api
npm run dev:web
```

Default API URL: `http://localhost:3000`
Default web URL: `http://localhost:5173`

## Runtime modes
### Demo mode (offline fixtures)
```bash
npm run seed:demo
npm run dev:api
npm run dev:web
```

Outputs:
- snapshot: `data/generated/demo-snapshot.json`
- report: `reports/demo-report.md`

### Live mode (actual public data where implemented)
```bash
npm run snapshot:live
SNAPSHOT_MODE=live npm run dev:api
npm run dev:web
```

Live mode currently ingests:
- `opensky` current-state public aircraft tracks

Important limitation:
- the public OpenSky path used here is a current-state slice, not a credentialed historical feed, so live mode currently produces live track snapshots but not live NOTAM/thermal/OSINT correlation or confirmed/probable event generation.

Live mode currently does **not** ingest by default:
- `adsb_exchange`
- `flightaware`
- `notam_feed`
- `icao_bulletins`
- `easa_bulletins`
- `nasa_firms` (credentialed API)
- `osint_news` (manual vetting required)

Live snapshot output path defaults to `data/generated/live-snapshot.json`.

## Build / test
```bash
npm run lint:types
npm test
npm run build
```

## Key environment variables
- `SNAPSHOT_MODE=demo|live`
- `SNAPSHOT_PATH=/path/to/snapshot.json`
- `DEMO_NOW=...` (demo mode only)
- `WORKER_LOOP=true|false`
- `INGESTION_INTERVAL_MS=300000`
- `PORT`, `HOST`
- `POSTGRES_URL`, `REDIS_URL` (still scaffolded in this repo)

## Docker
```bash
docker compose up --build
```

The web bundle reads `VITE_API_BASE_URL` at build time. The compose file now passes `http://localhost:3000` as a build arg so the browser-facing app talks to the locally published API port.

Services:
- API: `http://localhost:3000`
- Web: `http://localhost:4173`
- Postgres/PostGIS: `localhost:5432`
- Redis: `localhost:6379`

## Snapshot workflow
1. `scripts/seed-demo.ts` builds a deterministic fixture-backed snapshot for demo mode.
2. `apps/worker/src/worker.ts` can also build a live snapshot when `SNAPSHOT_MODE=live`.
3. `apps/api` reads the selected snapshot file and serves **non-operational, public-source analytical** map/timeline views.
4. `scripts/generate-demo-report.ts` renders `reports/demo-report.md` from demo mode; live reports use the same snapshot format but will describe the live provider set honestly.

## REST API
All public-facing API responses should be interpreted as **non-operational analytical outputs**. Response metadata now declares whether the underlying snapshot is `demo` or `live`.

- `GET /tracks?region=&start=&end=`
- `GET /events?region=&start=&end=&minConfidence=`
- `GET /events/:id`
- `GET /airspace/restrictions`
- `GET /regions`
- `POST /regions`
- `GET /health`
- `GET /metrics`

Additional supported filters:
- `bbox=minLon,minLat,maxLon,maxLat`
- `minAltitude`
- `maxAltitude`
- `sourceType`

Notes:
- Track/event/restriction responses include safety metadata.
- Event detail responses expose summarized audit payloads for transparency, not a raw tactical feed.
- Public geometry is coarsened for safer analytical display.

## Example custom region payload
```json
{
  "id": "levant-corridor-demo",
  "name": "Levant Corridor",
  "description": "Custom watch box",
  "bbox": {
    "minLon": 35.0,
    "minLat": 32.8,
    "maxLon": 36.2,
    "maxLat": 33.6
  },
  "tags": ["custom", "watchbox"]
}
```

## Observability
- Structured logs via Pino
- Prometheus metrics in `/metrics`
- Snapshot stats include ingestion lag, provider failures, dedupe rate, and event volume
- Raw source payload preservation for local auditability, with safer summarized API exposure

## Legal / data-quality caveats
- Respect provider terms, retention rules, and rate limits before enabling any additional live source.
- In live mode, this branch only claims support for sources that are actually implemented and reachable without dishonest scraping/fallback.
- Thermal anomalies are not proof of a strike.
- Airspace restrictions are strong indicators of elevated risk, not proof of impact.
- Weak-source OSINT remains explicitly labelled `unverified_report` when used in demo fixtures; no automated live OSINT firehose is claimed here.
- Simplified built-in polygons are seeded demo geometry, not official sovereign boundary data.
- Delayed/coarsened public output should not be reverse-engineered into tactical use.

## Generated outputs
- Demo snapshot: `data/generated/demo-snapshot.json`
- Live snapshot: `data/generated/live-snapshot.json`
- Sample report: `reports/demo-report.md`

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

The current implementation is deliberately bounded to seeded/demo and historical-style public-source analysis, with coarsened public display outputs and explicit uncertainty handling.

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
- provider interfaces and seeded adapters for OpenSky / ADS-B Exchange / FlightAware-compatible track feeds, NOTAM-style restrictions, ICAO/EASA bulletins, NASA FIRMS, and vetted OSINT/news inputs
- UTC normalization, rolling windows (6h / 24h / 72h), polygon/bbox validation, and custom region creation
- track deduplication / reconciliation and anomaly detection
- public-source analytical event correlation and transparent confidence scoring
- structured logging, retry/backoff, cache abstraction, and Prometheus metrics
- PostgreSQL + PostGIS schema/migrations
- Docker Compose stack with Postgres/PostGIS, Redis, API, worker, and web services
- seeded demo data, unit tests, integration tests, and generated sample report

## What is scaffolded / honest limits
- Live credentialed provider ingestion is scaffolded behind interfaces; the first implementation runs offline/seeded by default.
- PostGIS schema is production-oriented, but the running demo persists to `data/generated/demo-snapshot.json` so it works without standing up the full DB layer.
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
npm run seed:demo
npm run generate:report
npm run dev:api
npm run dev:web
```

Default API URL: `http://localhost:3000`
Default web URL: `http://localhost:5173`

## Build / test
```bash
npm run lint:types
npm test
npm run build
```

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

## Seeded workflow
1. `scripts/seed-demo.ts` builds a seeded snapshot from offline provider fixtures.
2. `apps/worker/src/worker.ts` refreshes that snapshot on an interval if desired.
3. `apps/api` reads the snapshot and serves **non-operational, public-source analytical** map/timeline views.
4. `scripts/generate-demo-report.ts` renders `reports/demo-report.md`.

## REST API
All public-facing API responses should be interpreted as **historical/delayed analytical outputs**.

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
- Respect provider terms, retention rules, and rate limits before switching from seeded adapters to live calls.
- Thermal anomalies are not proof of a strike.
- Airspace restrictions are strong indicators of elevated risk, not proof of impact.
- Weak-source OSINT remains explicitly labelled `unverified_report`.
- Simplified built-in polygons are seeded demo geometry, not official sovereign boundary data.
- Delayed/coarsened public output should not be reverse-engineered into tactical use.

## Generated outputs
- Seeded snapshot: `data/generated/demo-snapshot.json`
- Sample report: `reports/demo-report.md`

# Module / file structure

```text
geospatial-monitoring-system-20260329/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── routes/            # REST endpoints
│   │       ├── services/          # Snapshot query/filter logic
│   │       ├── repositories/      # File-backed repository + Postgres scaffold
│   │       ├── plugins/           # Prometheus metrics registry
│   │       ├── utils/             # Query, fs, and public-safety view helpers
│   │       ├── app.ts             # Fastify app builder
│   │       └── server.ts          # API bootstrap
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/        # Filters + evidence panel
│   │   │   ├── lib/               # API client
│   │   │   ├── styles/            # Dashboard styles
│   │   │   ├── App.tsx            # Map + timeline UI
│   │   │   └── main.tsx           # React entry
│   │   └── index.html
│   └── worker/
│       └── src/worker.ts          # Scheduled ingestion snapshot builder
├── packages/
│   └── core/
│       └── src/
│           ├── analytics/         # Corridor density, deviations, cluster summaries
│           ├── correlation/       # Event inference engine
│           ├── demo/              # Seed fixture providers and regions
│           ├── geo/               # Geometry validation/filtering
│           ├── ingestion/         # Snapshot orchestration
│           ├── normalization/     # Dedupe + track assembly
│           ├── providers/         # Cache, retry, adapter interfaces
│           ├── reporting/         # Markdown report generation
│           ├── scoring/           # Transparent confidence reasoning
│           ├── types/             # Shared domain model
│           └── utils/             # Time + distance helpers
├── database/migrations/           # Postgres/PostGIS DDL + seed reference data
├── data/generated/                # Seeded snapshot output
├── docs/                          # Architecture + schema docs
├── reports/                       # Generated demo report
├── scripts/                       # Seed and report generation entrypoints
└── tests/                         # Unit + integration test suites
```

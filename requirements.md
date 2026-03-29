Create a new instance, and build this for me. Let me know when it’s done, and send me the report form the program. Same organization we used for what we’re currently doing. Don’t let the work interfere. Do it as its own thing in tandem

Build a production-grade geospatial monitoring system that tracks aircraft movement and probable missile-strike events over the last 72 hours across:
- Iran
- Israel
- the Arabian Peninsula
- the Eastern Mediterranean

Primary goal:
Create a continuously updating map and event timeline that fuses flight-path data with conflict indicators. The system must distinguish between:
1. confirmed aircraft tracks
2. inferred strike-related events
3. unverified reports

Core requirements

1. Geographic scope
- Support polygon-based monitoring for:
 - Iranian territory
 - Israel
 - Arabian Peninsula
 - Eastern Mediterranean
- Allow custom GeoJSON polygons and bounding boxes
- Normalize all timestamps to UTC
- Support rolling windows: 6h, 24h, 72h

2. Flight tracking
- Ingest historical and near-real-time aircraft data from pluggable providers:
 - OpenSky
 - ADS-B Exchange
 - FlightAware-compatible adapters
- Store:
 - icao24 / hex id
 - callsign
 - timestamp
 - latitude / longitude
 - altitude
 - heading / track
 - speed if available
 - origin / destination when available
 - squawk if available
 - source provider
- Deduplicate and reconcile overlapping provider data
- Detect:
 - route deviations
 - abrupt altitude changes
 - holding patterns
 - unusual gaps / transponder loss
 - sudden corridor shifts
 - airspace exits and re-entries

3. Strike and conflict event inference
- Ingest conflict indicators from pluggable sources:
 - NOTAM / airspace restriction feeds
 - EASA / ICAO conflict-zone bulletins
 - NASA FIRMS thermal anomaly data
 - vetted OSINT/news adapters
- Build an event-classification pipeline with these classes:
 - confirmed_strike
 - probable_strike
 - airspace_closure
 - aircraft_diversion_cluster
 - thermal_anomaly
 - unverified_report
- Every inferred event must include:
 - event id
 - event type
 - timestamp range
 - lat/lon or polygon
 - source list
 - confidence score 0.0 to 1.0
 - explanation of why the event was inferred

4. Confidence model
- Never label a missile strike as confirmed from a single weak source
- Use weighted evidence:
 - official airspace restrictions
 - multiple independent reports
 - correlated FIRMS hotspot
 - nearby flight diversion cluster
 - temporal clustering
- Output a transparent reasoning object showing which signals increased or decreased confidence

5. Storage and architecture
- Use TypeScript end to end
- Backend:
 - Node.js
 - Fastify or NestJS
 - PostgreSQL + PostGIS
 - Redis for caching / short-term queues
- Pipeline:
 - scheduled ingestion workers
 - normalization layer
 - event correlation engine
 - REST API
- Frontend:
 - React + MapLibre GL or Leaflet
- Use clean architecture with modules:
 - providers
 - ingestion
 - normalization
 - correlation
 - scoring
 - api
 - frontend
- Keep provider adapters behind interfaces

6. Map UI
- Show:
 - live / historical aircraft tracks
 - clustered flight density
 - inferred strike markers
 - thermal anomaly overlays
 - restricted airspace / advisories
- Filters:
 - time window
 - altitude band
 - aircraft type if available
 - country / region
 - confidence threshold
 - source type
- Clicking an event must show all source evidence and reasoning

7. API design
Implement endpoints for:
- GET /tracks?region=&start=&end=
- GET /events?region=&start=&end=&minConfidence=
- GET /events/:id
- GET /airspace/restrictions
- GET /regions
- POST /regions
- GET /health
- GET /metrics

8. Analytics and detection rules
Implement:
- flight density by corridor
- baseline vs current deviation analysis
- transponder-loss anomaly windows
- route reroute clustering near conflict zones
- thermal anomaly clustering by time and distance
- event correlation across heterogeneous sources

9. Reliability and observability
- Add structured logging
- Add metrics for ingestion lag, provider failures, dedupe rate, event volume
- Add retries with backoff
- Cache provider calls where legally and technically appropriate
- Fail closed on malformed geospatial data
- Preserve raw source payloads for auditability

10. Testing
- Unit tests for:
 - geometry filtering
 - deduplication
 - scoring
 - correlation rules
- Integration tests for provider adapters
- Seed test fixtures for:
 - dense commercial airspace
 - low-coverage regions
 - conflicting reports
 - fake thermal anomalies
- No real network calls in unit tests

11. Security and legal constraints
- Respect provider rate limits and terms
- Do not claim military-grade certainty
- Clearly label inferred events vs confirmed events
- Add source attribution metadata
- Add disclaimer that missile tracking is probabilistic unless validated by authoritative sources

12. Deliverables
Produce:
- architecture overview
- database schema
- provider interfaces
- initial TypeScript implementation
- correlation/scoring engine
- REST API
- basic frontend map
- seed data scripts
- Docker setup
- tests
- README with setup, limitations, and data-quality caveats

13. Non-goals
Do not:
- pretend to directly track all missiles
- infer precise attribution without evidence
- rely on a single OSINT source
- hardcode region assumptions; use configurable polygons

14. Output format
Return:
1. system architecture
2. module/file structure
3. database schema
4. TypeScript code
5. tests
6. setup instructions
7. known limitations

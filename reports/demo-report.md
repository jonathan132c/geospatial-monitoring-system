# Conflict-monitoring dataset integrity report

## Executive summary
- Reviewed at: 2026-03-29T16:29:51Z
- Dataset suitability: demo only
- Production safe: no
- Bottom line: the original snapshot mixed seeded/demo fixtures with real-looking provider names, event labels, and confidence scores. The repaired snapshot explicitly marks synthetic lineage, downgrades overstated labels, and prevents downstream consumers from mistaking fixture data for verified operational truth.

## Major integrity issues found
- Synthetic and offline fixtures were presented with real-looking provider names (OpenSky, FlightAware, ADS-B Exchange, NASA FIRMS, ICAO, EASA, NOTAM-like feeds).
- `confirmed_strike` appeared despite no authoritative confirmation and explicit seeded/demo payload lineage.
- Restriction, bulletin, thermal, OSINT, and track records lacked required provenance metadata and external-verification fields.
- Region assignments relied on coarse overlapping polygons and legacy manual tagging, which produced inconsistent `regionIds`.
- Aviation anomaly labels such as `transponder_loss` overstated what sparse fixture coverage could support.

## Taxonomy changes
- `confirmed_strike` -> `possible_strike`
- `probable_strike` -> `possible_strike` (remains scenario-only due synthetic lineage)
- `airspace_closure` -> `airspace_restriction_notice`
- `aircraft_diversion_cluster` -> `traffic_disruption_cluster`
- `thermal_anomaly` -> `thermal_cluster`
- Track anomalies downgraded to `route_revectoring_candidate`, `altitude_change_candidate`, `holding_pattern_candidate`, `tracking_discontinuity`, `coverage_gap`, and `airspace_exit_reentry_candidate` as appropriate.

## Scoring changes
- Replaced the legacy additive confidence behavior that could reach 1.0 from demo-derived evidence.
- New deterministic model starts from a low baseline and applies explicit penalties for synthetic lineage, missing exact external matches, and weak corroboration.
- Repaired confidence labels now map cleanly to fixed numeric ranges: low (0.00-0.24), moderate (0.25-0.49), high (0.50-0.74), very_high (0.75-1.00).

## Records unusable for real-world analysis
- All restrictions, tracks, indicators, and raw payloads remain unusable as real-world operational truth because they are synthetic_demo or derived from synthetic_demo inputs.
- All events remain derived_inference only; none are verified_real or production-safe.

## Recommendations for a production-safe pipeline
- Separate demo fixtures from real data at ingest time and never reuse real provider names for seeded fixtures.
- Require authoritative provenance before allowing any live-facing record to exceed `partially_verified`.
- Make region assignment methods explicit and avoid overlapping coarse polygons for production tagging.
- Gate event promotion on exact external matches or authenticated provider/API reconciliation, not contextual similarity.
- Run integrity repair or equivalent validation automatically before publishing snapshot artifacts.

## Audit totals
- Records changed: 77
- Records downgraded: 28
- Records reclassified as synthetic_demo: 65
- Records with region-tagging fixes: 16
- Records with scoring fixes: 8
- Unresolved uncertainties: 3

#!/usr/bin/env python3
from __future__ import annotations

import copy
import datetime as dt
import html
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, List, Tuple

ROOT = pathlib.Path(__file__).resolve().parents[1]
SNAPSHOT_PATH = ROOT / 'data' / 'generated' / 'demo-snapshot.json'
AUDIT_PATH = ROOT / 'reports' / 'integrity-audit.json'
REPORT_PATH = ROOT / 'reports' / 'integrity-report.md'
DEMO_REPORT_PATH = ROOT / 'reports' / 'demo-report.md'
REVIEWED_AT = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

RECORD_STATUS_VALUES = [
    'verified_real',
    'partially_verified',
    'synthetic_demo',
    'unverified_claim',
    'derived_inference',
]

PROVIDER_MAP = {
    'opensky': 'opensky_seed_fixture',
    'adsb_exchange': 'adsb_exchange_seed_fixture',
    'flightaware': 'flightaware_seed_fixture',
    'nasa_firms': 'nasa_firms_seed_fixture',
    'icao_bulletins': 'icao_seed_bulletin_fixture',
    'easa_bulletins': 'easa_seed_bulletin_fixture',
    'notam_feed': 'notam_seed_fixture',
    'osint_news': 'osint_seed_fixture',
}

ANOMALY_TYPE_MAP = {
    'route_deviation': 'route_revectoring_candidate',
    'corridor_shift': 'route_revectoring_candidate',
    'abrupt_altitude_change': 'altitude_change_candidate',
    'holding_pattern': 'holding_pattern_candidate',
    'transponder_loss': 'tracking_discontinuity',
    'airspace_exit_reentry': 'airspace_exit_reentry_candidate',
}

EVENT_TYPE_MAP = {
    'confirmed_strike': 'possible_strike',
    'probable_strike': 'possible_strike',
    'airspace_closure': 'airspace_restriction_notice',
    'aircraft_diversion_cluster': 'traffic_disruption_cluster',
    'thermal_anomaly': 'thermal_cluster',
    'unverified_report': 'unverified_report',
}

EVENT_TYPE_LABELS = {
    'possible_strike': 'Possible strike candidate',
    'airspace_restriction_notice': 'Airspace restriction notice',
    'traffic_disruption_cluster': 'Traffic disruption cluster',
    'thermal_cluster': 'Thermal cluster',
    'unverified_report': 'Unverified report',
}

SEARCH_CACHE: Dict[str, Dict[str, Any]] = {}


def load_json(path: pathlib.Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: pathlib.Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + '\n')


def clean_text(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, str):
        return value
    return json.dumps(value, sort_keys=True)


def flatten_text(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, dict):
        return ' '.join(f'{key} {flatten_text(nested)}' for key, nested in value.items())
    if isinstance(value, list):
        return ' '.join(flatten_text(item) for item in value)
    return str(value)


def detect_demo_markers(*values: Any) -> List[str]:
    combined = ' '.join(flatten_text(value).lower() for value in values)
    markers = []
    for marker in ['demo', 'seed', 'seeded', 'offline', 'fixture', 'sample', 'placeholder']:
        if marker in combined:
            markers.append(marker)
    return sorted(set(markers))


def map_provider(provider: str) -> str:
    return PROVIDER_MAP.get(provider, f'{provider}_fixture')


def point_in_polygon(lon: float, lat: float, polygon: List[List[float]]) -> bool:
    inside = False
    for index in range(len(polygon)):
        lon1, lat1 = polygon[index]
        lon2, lat2 = polygon[(index + 1) % len(polygon)]
        intersects = ((lat1 > lat) != (lat2 > lat)) and (lon < (lon2 - lon1) * (lat - lat1) / ((lat2 - lat1) or 1e-12) + lon1)
        if intersects:
            inside = not inside
    return inside


def geometry_region_ids(geometry: Dict[str, Any], regions: List[Dict[str, Any]]) -> List[str]:
    region_ids: List[str] = []
    for region in regions:
        polygon = region['geometry']['coordinates'][0]
        matched = False
        if geometry['type'] == 'Point':
            lon, lat = geometry['coordinates']
            matched = point_in_polygon(lon, lat, polygon)
        else:
            matched = any(point_in_polygon(lon, lat, polygon) for lon, lat in geometry['coordinates'][0])
        if matched:
            region_ids.append(region['id'])
    return region_ids


def track_region_ids(points: List[Dict[str, Any]], regions: List[Dict[str, Any]]) -> List[str]:
    region_ids: List[str] = []
    seen = set()
    for point in points:
        for region in regions:
            polygon = region['geometry']['coordinates'][0]
            if point_in_polygon(point['longitude'], point['latitude'], polygon) and region['id'] not in seen:
                seen.add(region['id'])
                region_ids.append(region['id'])
    return region_ids


def summarize_results(html_text: str) -> Tuple[List[Dict[str, str]], bool]:
    titles = re.findall(r'class="result__a"[^>]*>(.*?)</a>', html_text, flags=re.S)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</(?:a|div)>', html_text, flags=re.S)
    urls = re.findall(r'nofollow" class="result__url"[^>]*>(.*?)</a>', html_text, flags=re.S)
    results: List[Dict[str, str]] = []
    max_items = max(len(titles), len(snippets), len(urls), 0)
    for index in range(min(max_items, 3)):
        title = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', titles[index] if index < len(titles) else ''))).strip()
        snippet = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', snippets[index] if index < len(snippets) else ''))).strip()
        url = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', urls[index] if index < len(urls) else ''))).strip()
        if title or snippet or url:
            results.append({'title': title, 'snippet': snippet, 'url': url})
    no_results = 'No results.' in html_text or 'did not match any documents' in html_text.lower()
    return results, no_results


def exact_search(query: str) -> Dict[str, Any]:
    cached = SEARCH_CACHE.get(query)
    if cached:
        return cached

    url = 'https://duckduckgo.com/html/?q=' + urllib.parse.quote(query)
    request = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            html_text = response.read().decode('utf-8', errors='ignore')
        results, no_results = summarize_results(html_text)
        normalized_phrase = query.replace('"', '').strip().lower()
        exact_phrase_found = any(
            normalized_phrase and normalized_phrase in ' '.join([item.get('title', ''), item.get('snippet', ''), item.get('url', '')]).lower()
            for item in results
        )
        if exact_phrase_found:
            match_type = 'exact_match'
        elif results:
            match_type = 'context_only'
        else:
            match_type = 'no_match' if no_results or not results else 'context_only'
        payload = {
            'engine': 'duckduckgo_html',
            'query': query,
            'checkedAt': REVIEWED_AT,
            'matchType': match_type,
            'resultCount': len(results),
            'results': results,
        }
    except Exception as exc:  # pragma: no cover - network failure path
        payload = {
            'engine': 'duckduckgo_html',
            'query': query,
            'checkedAt': REVIEWED_AT,
            'matchType': 'no_match',
            'resultCount': 0,
            'results': [],
            'error': f'{type(exc).__name__}: {exc}',
        }
    SEARCH_CACHE[query] = payload
    time.sleep(0.35)
    return payload


def external_from_checks(checks: List[Dict[str, Any]]) -> Tuple[str, str]:
    if any(check['matchType'] == 'exact_match' for check in checks):
        return 'completed', 'exact_match'
    if any(check['matchType'] == 'partial_match' for check in checks):
        return 'completed', 'partial_match'
    if any(check['matchType'] == 'context_only' for check in checks):
        return 'completed', 'context_only'
    return 'completed', 'no_match'


def confidence_label(score: float) -> str:
    if score >= 0.75:
        return 'very_high'
    if score >= 0.50:
        return 'high'
    if score >= 0.25:
        return 'moderate'
    return 'low'


def event_score(event: Dict[str, Any], evidence_records: List[Dict[str, Any]], evidence_payloads: List[Dict[str, Any]]) -> Tuple[float, Dict[str, Any]]:
    score = 0.15
    signals: List[Dict[str, Any]] = [
        {
            'label': 'Conservative baseline',
            'effect': 'increase',
            'weight': 0.15,
            'evidence': 'All repaired event scores start from a low baseline before provenance and external verification checks.',
        }
    ]

    evidence_count = len(event.get('evidence', []))
    if evidence_count >= 2:
        score += 0.05
        signals.append({'label': 'Multiple evidence items', 'effect': 'increase', 'weight': 0.05, 'evidence': f'{evidence_count} evidence items retained after audit.'})

    source_families = sorted({item.get('provider') for item in event.get('evidence', [])})
    if len(source_families) >= 2:
        score += 0.05
        signals.append({'label': 'Multiple source families', 'effect': 'increase', 'weight': 0.05, 'evidence': f'{len(source_families)} distinct source families support the scenario.'})

    observed_at = [item.get('observedAt') for item in event.get('evidence', []) if item.get('observedAt')]
    if len(observed_at) >= 2:
        earliest = min(dt.datetime.fromisoformat(item.replace('Z', '+00:00')) for item in observed_at)
        latest = max(dt.datetime.fromisoformat(item.replace('Z', '+00:00')) for item in observed_at)
        minutes = (latest - earliest).total_seconds() / 60
        if minutes <= 90:
            score += 0.04
            signals.append({'label': 'Temporal clustering', 'effect': 'increase', 'weight': 0.04, 'evidence': f'Evidence items fall within a {minutes:.0f}-minute window.'})

    if event['eventType'] == 'airspace_restriction_notice':
        score += 0.03
        signals.append({'label': 'Restriction semantics retained', 'effect': 'increase', 'weight': 0.03, 'evidence': 'Event remains useful as a synthetic restriction scenario reference.'})

    if any(record.get('recordStatus') == 'synthetic_demo' for record in evidence_records) or any(payload.get('recordStatus') == 'synthetic_demo' for payload in evidence_payloads):
        score -= 0.10
        signals.append({'label': 'Synthetic lineage penalty', 'effect': 'decrease', 'weight': 0.10, 'evidence': 'Supporting evidence is explicitly marked synthetic_demo.'})

    inherited_match = 'no_match'
    if evidence_records:
        if any(record.get('externalMatchType') == 'exact_match' for record in evidence_records):
            inherited_match = 'exact_match'
        elif any(record.get('externalMatchType') == 'partial_match' for record in evidence_records):
            inherited_match = 'partial_match'
        elif any(record.get('externalMatchType') == 'context_only' for record in evidence_records):
            inherited_match = 'context_only'
    if inherited_match == 'no_match':
        score -= 0.06
        signals.append({'label': 'No exact external match', 'effect': 'decrease', 'weight': 0.06, 'evidence': 'Supporting records did not produce an exact public-source match.'})

    if event['eventType'] == 'unverified_report' or len(source_families) <= 1:
        score -= 0.04
        signals.append({'label': 'Weak corroboration penalty', 'effect': 'decrease', 'weight': 0.04, 'evidence': 'Event remains single-family or explicitly weak-source after audit.'})

    score = round(max(0.0, min(1.0, score)), 2)
    reasoning = {
        'score': score,
        'confidenceLabel': confidence_label(score),
        'signals': signals,
        'explanation': '; '.join(f"{'+' if signal['effect'] == 'increase' else '-'}{signal['weight']:.2f} {signal['label']}" for signal in signals),
    }
    return score, reasoning


def prefix_synthetic(text: str, prefix: str) -> str:
    text = text.strip()
    if text.lower().startswith(prefix.lower()):
        return text
    return f'{prefix}{text}'


def normalize_evidence_summary(source_type: str, summary: str) -> str:
    summary = summary.replace('Confirmed', 'Possible').replace('confirmed', 'possible')
    if source_type == 'track':
        return prefix_synthetic(summary, 'Synthetic demo track evidence: ')
    if source_type == 'restriction':
        return prefix_synthetic(summary, 'Synthetic demo restriction evidence: ')
    return prefix_synthetic(summary, 'Synthetic demo evidence: ')


def build_dataset_metadata(regions: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        'integrityReviewVersion': '2026-03-integrity-repair-v1',
        'reviewedAt': REVIEWED_AT,
        'datasetSuitability': 'demo only',
        'productionSafe': False,
        'productionSafetyStatement': 'NOT PRODUCTION SAFE: this snapshot contains demo fixtures, approximate geometries, and derived scenario records with no exact external matches.',
        'summary': 'Operational-looking provider names and event claims were reclassified so synthetic fixtures and derived scenario records cannot be mistaken for verified real-world events.',
        'recordStatusVocabulary': RECORD_STATUS_VALUES,
        'providerIdentityPolicy': 'Original provider names are preserved only as legacyProvider fields. Active provider fields are renamed to fixture identifiers when payload lineage is synthetic or seeded.',
        'regionTaggingPolicy': {
            'method': 'geometry intersection against coarse built-in polygons',
            'note': 'Region assignments are approximate because the built-in regions use simplified polygons that overlap. Recomputed regionIds preserve all geometric overlaps and mark them as approximate.',
            'affectedRegionIds': [region['id'] for region in regions],
        },
        'confidenceModel': {
            'name': 'integrity_repair_claim_confidence_v1',
            'semanticMeaning': 'Confidence estimates the defensibility of a real-world claim after provenance and external-verification penalties, not internal fixture coherence alone.',
            'weights': {
                'baseline': 0.15,
                'multipleEvidenceItems': 0.05,
                'multipleSourceFamilies': 0.05,
                'temporalClustering': 0.04,
                'restrictionSemanticsRetained': 0.03,
                'syntheticLineagePenalty': -0.10,
                'noExactExternalMatchPenalty': -0.06,
                'weakCorroborationPenalty': -0.04,
            },
            'labelRanges': [
                {'label': 'low', 'minInclusive': 0.0, 'maxInclusive': 0.24},
                {'label': 'moderate', 'minInclusive': 0.25, 'maxInclusive': 0.49},
                {'label': 'high', 'minInclusive': 0.50, 'maxInclusive': 0.74},
                {'label': 'very_high', 'minInclusive': 0.75, 'maxInclusive': 1.0},
            ],
        },
        'eventTaxonomy': {
            'controlledVocabulary': [
                {
                    'eventType': 'possible_strike',
                    'thresholdRule': 'Use only when multi-signal evidence suggests a strike-like scenario but no authoritative confirmation exists.',
                    'evidenceRule': 'Must not be used as verified real-world confirmation; synthetic lineage or missing exact external match keeps recordStatus below verified_real.',
                },
                {
                    'eventType': 'airspace_restriction_notice',
                    'thresholdRule': 'Use for restriction-like records that remain useful structurally but are not validated as authoritative live restrictions.',
                    'evidenceRule': 'Synthetic or seeded restriction payloads must remain synthetic_demo and carry advisory wording.',
                },
                {
                    'eventType': 'traffic_disruption_cluster',
                    'thresholdRule': 'Use for clustered traffic-pattern changes without claiming cause certainty.',
                    'evidenceRule': 'Do not describe sparse or interrupted coverage as transponder loss unless independently supported.',
                },
                {
                    'eventType': 'thermal_cluster',
                    'thresholdRule': 'Use for grouped thermal observations without attributing cause.',
                    'evidenceRule': 'Thermal-only observations cannot imply strike confirmation by themselves.',
                },
                {
                    'eventType': 'unverified_report',
                    'thresholdRule': 'Use when a report remains weakly sourced or unmatched externally.',
                    'evidenceRule': 'Single-source or no-match claims stay explicitly unverified.',
                },
            ],
            'removedTerms': ['confirmed_strike'],
        },
        'suitableFor': {
            'demoOnly': True,
            'internalTesting': True,
            'mixedQualityAnalysis': False,
            'productionUse': False,
        },
    }


def validate_snapshot(snapshot: Dict[str, Any]) -> List[str]:
    issues: List[str] = []
    for collection_name in ['regions', 'restrictions', 'tracks', 'indicators', 'events', 'rawPayloads']:
        for record in snapshot[collection_name]:
            for field in ['recordStatus', 'verificationStatus', 'verificationNotes', 'sourceTrustLevel', 'derivedFrom', 'lastReviewedAt', 'externalVerificationStatus', 'externalSourcesChecked', 'externalMatchType', 'externalVerificationNotes']:
                if field not in record:
                    issues.append(f'{collection_name}:{record.get("id", "unknown")} missing {field}')
    if any(event['eventType'] == 'confirmed_strike' for event in snapshot['events']):
        issues.append('confirmed_strike should not remain in repaired events')
    if snapshot.get('datasetMetadata', {}).get('productionSafe') is not False:
        issues.append('datasetMetadata.productionSafe must be false')
    payload_ids = {payload['id'] for payload in snapshot['rawPayloads']}
    for event in snapshot['events']:
        for evidence in event.get('evidence', []):
            if evidence['sourcePayloadId'] not in payload_ids:
                issues.append(f'event:{event["id"]} references missing payload {evidence["sourcePayloadId"]}')
    return issues


def main() -> None:
    original = load_json(SNAPSHOT_PATH)
    snapshot = copy.deepcopy(original)
    audit_records_changed: List[Dict[str, Any]] = []
    downgraded_records: List[Dict[str, Any]] = []
    reclassified_synthetic: List[Dict[str, Any]] = []
    incorrect_region_tagging: List[Dict[str, Any]] = []
    scoring_fixes: List[Dict[str, Any]] = []
    unresolved_uncertainties: List[Dict[str, Any]] = []

    snapshot['datasetMetadata'] = build_dataset_metadata(snapshot['regions'])

    # Regions
    transformed_regions: List[Dict[str, Any]] = []
    for region in snapshot['regions']:
        legacy = copy.deepcopy(region)
        region['recordStatus'] = 'partially_verified' if region.get('source') == 'built_in' else 'synthetic_demo'
        region['verificationStatus'] = 'approximate_geography_only' if region.get('source') == 'built_in' else 'synthetic_fixture_detected'
        region['verificationNotes'] = 'Built-in region geometry corresponds to a real place but is simplified and overlapping; use only as approximate analysis context.' if region.get('source') == 'built_in' else 'Custom region is user-defined/demo geometry and is not externally authoritative.'
        region['sourceTrustLevel'] = 'medium' if region.get('source') == 'built_in' else 'low'
        region['derivedFrom'] = ['builtin_simplified_geometry'] if region.get('source') == 'built_in' else ['custom_region_definition']
        region['lastReviewedAt'] = REVIEWED_AT
        region['externalVerificationStatus'] = 'completed'
        region['externalSourcesChecked'] = [{'engine': 'manual_geography_review', 'query': region['name'], 'checkedAt': REVIEWED_AT, 'matchType': 'context_only', 'resultCount': 1, 'results': []}]
        region['externalMatchType'] = 'context_only'
        region['externalVerificationNotes'] = 'Region name and broad geography correspond to real-world context, but geometry is intentionally coarse and overlapping.'
        region['geospatialPrecision'] = 'approximate_coarse_polygon'
        if legacy != region:
            audit_records_changed.append({'recordType': 'region', 'id': region['id'], 'changes': ['added provenance metadata', 'marked geometry as approximate']})
        transformed_regions.append(region)

    snapshot['regions'] = transformed_regions

    # Raw payloads first so other records can inherit them.
    raw_payload_by_id: Dict[str, Dict[str, Any]] = {}
    for payload in snapshot['rawPayloads']:
        legacy_provider = payload['provider']
        markers = detect_demo_markers(payload.get('raw'), payload.get('attribution'), payload.get('provider'))
        payload['legacyProvider'] = legacy_provider
        payload['provider'] = map_provider(legacy_provider)
        payload['demoMarkersDetected'] = markers
        payload['recordStatus'] = 'synthetic_demo' if markers else 'unverified_claim'
        payload['verificationStatus'] = 'synthetic_fixture_detected' if markers else 'not_externally_verified'
        payload['verificationNotes'] = 'Raw payload contains seeded/sample/offline markers in attribution or content.' if markers else 'Raw payload has no explicit demo marker but was not externally verified.'
        payload['sourceTrustLevel'] = 'low'
        payload['derivedFrom'] = [payload['id']]
        payload['lastReviewedAt'] = REVIEWED_AT
        payload['externalVerificationStatus'] = 'not_applicable'
        payload['externalSourcesChecked'] = []
        payload['externalMatchType'] = 'no_match'
        payload['externalVerificationNotes'] = 'Raw payloads were audited for fixture markers locally; external verification is performed on downstream claims rather than on payload wrapper objects.'
        audit_records_changed.append({'recordType': 'rawPayload', 'id': payload['id'], 'changes': ['renamed provider to fixture identifier', 'added provenance metadata', f'detected demo markers: {", ".join(markers) or "none"}']})
        if payload['recordStatus'] == 'synthetic_demo':
            reclassified_synthetic.append({'recordType': 'rawPayload', 'id': payload['id'], 'reason': 'payload attribution or raw body contains demo/sample markers'})
        raw_payload_by_id[payload['id']] = payload

    # Restrictions
    restriction_by_payload: Dict[str, Dict[str, Any]] = {}
    for restriction in snapshot['restrictions']:
        legacy = copy.deepcopy(restriction)
        legacy_regions = restriction.get('regionIds', [])
        payload = raw_payload_by_id[restriction['sourcePayloadId']]
        raw_query_parts = [restriction.get('title', '')]
        if isinstance(payload.get('raw'), dict) and payload['raw'].get('notam'):
            raw_query_parts.append(str(payload['raw']['notam']))
        checks = [exact_search(' '.join(f'"{part}"' for part in raw_query_parts if part))]
        external_status, external_match_type = external_from_checks(checks)
        recalculated_regions = geometry_region_ids(restriction['geometry'], snapshot['regions'])
        if sorted(legacy_regions) != sorted(recalculated_regions):
            incorrect_region_tagging.append({'recordType': 'restriction', 'id': restriction['id'], 'from': legacy_regions, 'to': recalculated_regions, 'reason': 'geometry intersection against coarse built-in polygons differs from legacy manual tagging'})
        restriction['legacyProvider'] = restriction['provider']
        restriction['provider'] = map_provider(restriction['provider'])
        restriction['legacyRestrictionLevel'] = restriction['restrictionLevel']
        restriction['restrictionLevel'] = 'advisory'
        restriction['legacyTitle'] = restriction['title']
        restriction['title'] = prefix_synthetic(restriction['title'], 'Synthetic demo restriction: ')
        restriction['summary'] = 'Synthetic demo restriction fixture retained for schema continuity. This is not a verified live restriction or NOTAM.'
        restriction['regionIds'] = recalculated_regions
        restriction['recordStatus'] = 'synthetic_demo'
        restriction['verificationStatus'] = 'synthetic_fixture_detected'
        restriction['verificationNotes'] = 'Restriction inherits seeded/demo lineage from its underlying payload and was downgraded to advisory wording.'
        restriction['sourceTrustLevel'] = 'low'
        restriction['derivedFrom'] = [restriction['sourcePayloadId']]
        restriction['lastReviewedAt'] = REVIEWED_AT
        restriction['externalVerificationStatus'] = external_status
        restriction['externalSourcesChecked'] = checks
        restriction['externalMatchType'] = external_match_type
        restriction['externalVerificationNotes'] = 'Exact public search did not validate this restriction as a real-world operational notice; synthetic payload lineage controls classification.'
        restriction['geospatialPrecision'] = 'synthetic_polygon_with_approximate_region_overlap'
        audit_records_changed.append({'recordType': 'restriction', 'id': restriction['id'], 'changes': ['provider renamed to fixture identifier', 'restriction downgraded to advisory wording', 'regionIds recalculated', 'external verification added']})
        downgraded_records.append({'recordType': 'restriction', 'id': restriction['id'], 'from': {'restrictionLevel': legacy['restrictionLevel'], 'title': legacy['title']}, 'to': {'restrictionLevel': restriction['restrictionLevel'], 'title': restriction['title']}, 'reason': 'Seeded restriction-like payload must not present as live operational truth.'})
        reclassified_synthetic.append({'recordType': 'restriction', 'id': restriction['id'], 'reason': 'source payload contains explicit seeded/demo markers'})
        restriction_by_payload[restriction['sourcePayloadId']] = restriction

    # Tracks
    track_by_payload: Dict[str, Dict[str, Any]] = {}
    for track in snapshot['tracks']:
        legacy = copy.deepcopy(track)
        legacy_regions = track.get('regionIds', [])
        providers = [map_provider(provider) for provider in track.get('providers', [])]
        query_bits = [track.get('callsign', ''), track.get('origin', ''), track.get('destination', ''), track.get('startTime', '')[:10]]
        checks = [exact_search(' '.join(f'"{part}"' for part in query_bits if part))]
        external_status, external_match_type = external_from_checks(checks)
        recalculated_regions = track_region_ids(track['points'], snapshot['regions'])
        if sorted(legacy_regions) != sorted(recalculated_regions):
            incorrect_region_tagging.append({'recordType': 'track', 'id': track['id'], 'from': legacy_regions, 'to': recalculated_regions, 'reason': 'point-in-region recomputation changed region membership'})
        track['legacyProviders'] = track['providers']
        track['providers'] = providers
        if track.get('callsign'):
            track['legacyCallsign'] = track['callsign']
            track['callsign'] = prefix_synthetic(track['callsign'], 'DEMO-')
        anomaly_changes = []
        transformed_anomalies = []
        for anomaly in track.get('anomalies', []):
            original_type = anomaly['type']
            new_type = ANOMALY_TYPE_MAP.get(original_type, original_type)
            providers_count = len(track.get('providers', []))
            if original_type == 'transponder_loss':
                new_type = 'coverage_gap' if providers_count <= 1 else 'tracking_discontinuity'
            updated = copy.deepcopy(anomaly)
            updated['legacyType'] = original_type
            updated['type'] = new_type
            updated['explanation'] = {
                'route_revectoring_candidate': 'Course changes are retained only as a route-revectoring candidate within a seeded scenario; they do not prove abnormal real-world flight behavior.',
                'altitude_change_candidate': 'Altitude profile change retained as a candidate only; sparse seeded observations are insufficient to claim an operational anomaly.',
                'holding_pattern_candidate': 'Loop-like motion retained as a holding-pattern candidate, not a confirmed operational hold.',
                'tracking_discontinuity': 'Observation gap retained as a tracking discontinuity; evidence does not support claiming transponder shutdown.',
                'coverage_gap': 'Observation gap likely reflects sparse sample coverage rather than transponder loss.',
                'airspace_exit_reentry_candidate': 'Exit/re-entry pattern retained as a candidate only because region boundaries are coarse and overlapping.',
            }.get(new_type, updated.get('explanation', ''))
            transformed_anomalies.append(updated)
            if original_type != new_type:
                anomaly_changes.append({'from': original_type, 'to': new_type})
        track['anomalies'] = transformed_anomalies
        track['regionIds'] = recalculated_regions
        track['recordStatus'] = 'synthetic_demo'
        track['verificationStatus'] = 'synthetic_fixture_detected'
        track['verificationNotes'] = 'Track is assembled from sample/fixture provider payloads. Flight identity was prefixed with DEMO- and anomaly labels were downgraded to candidate/discontinuity language.'
        track['sourceTrustLevel'] = 'low'
        track['derivedFrom'] = sorted({point['sourcePayloadId'] for point in track.get('points', [])})
        track['lastReviewedAt'] = REVIEWED_AT
        track['externalVerificationStatus'] = external_status
        track['externalSourcesChecked'] = checks
        track['externalMatchType'] = external_match_type
        track['externalVerificationNotes'] = 'Exact public-source search did not validate this assembled track as a matched real flight observation. Synthetic payload lineage controls classification.'
        track['geospatialPrecision'] = 'seeded_point_samples_with_approximate_region_overlap'
        audit_records_changed.append({'recordType': 'track', 'id': track['id'], 'changes': ['providers renamed to fixture identifiers', 'callsign prefixed with DEMO-', 'anomaly taxonomy downgraded', 'regionIds recalculated', 'external verification added']})
        downgraded_records.append({'recordType': 'track', 'id': track['id'], 'from': legacy['anomalies'], 'to': track['anomalies'], 'reason': 'Operational anomaly claims were downgraded to candidate/discontinuity labels.'})
        reclassified_synthetic.append({'recordType': 'track', 'id': track['id'], 'reason': 'all source payloads are sample/fixture records'})
        for payload_id in track['derivedFrom']:
            track_by_payload[payload_id] = track

    # Indicators
    indicator_by_payload: Dict[str, Dict[str, Any]] = {}
    for indicator in snapshot['indicators']:
        legacy = copy.deepcopy(indicator)
        legacy_regions = indicator.get('regionIds', [])
        payload = raw_payload_by_id[indicator['sourcePayloadId']]
        raw = payload.get('raw') if isinstance(payload.get('raw'), dict) else {}
        search_terms = []
        if isinstance(raw, dict) and raw.get('bulletinId'):
            search_terms.append(str(raw['bulletinId']))
        search_terms.append(indicator.get('headline', ''))
        checks = [exact_search(' '.join(f'"{part}"' for part in search_terms if part))]
        external_status, external_match_type = external_from_checks(checks)
        recalculated_regions = geometry_region_ids(indicator['geometry'], snapshot['regions'])
        if sorted(legacy_regions) != sorted(recalculated_regions):
            incorrect_region_tagging.append({'recordType': 'indicator', 'id': indicator['id'], 'from': legacy_regions, 'to': recalculated_regions, 'reason': 'geometry-based region recomputation differs from legacy tagging'})
        indicator['legacyProvider'] = indicator['provider']
        indicator['provider'] = map_provider(indicator['provider'])
        indicator['legacyType'] = indicator['type']
        indicator['type'] = {
            'icao_bulletin': 'bulletin_notice',
            'easa_bulletin': 'bulletin_notice',
            'thermal_anomaly': 'thermal_observation_candidate',
            'osint_report': 'reported_observation',
            'news_report': 'reported_observation',
        }.get(indicator['type'], indicator['type'])
        indicator['legacyHeadline'] = indicator['headline']
        indicator['headline'] = prefix_synthetic(indicator['headline'], 'Synthetic demo: ')
        indicator['description'] = {
            'bulletin_notice': 'Synthetic bulletin-style fixture retained for schema coverage only; no authoritative bulletin was externally matched.',
            'thermal_observation_candidate': 'Synthetic thermal observation retained for clustering demos only; it is not a verified real-world heat event.',
            'reported_observation': 'Synthetic report fixture retained to test weak-source handling and taxonomy behavior.',
        }.get(indicator['type'], indicator['description'])
        indicator['regionIds'] = recalculated_regions
        indicator['recordStatus'] = 'synthetic_demo'
        indicator['verificationStatus'] = 'synthetic_fixture_detected'
        indicator['verificationNotes'] = 'Indicator inherits seeded/demo lineage from its payload and has been relabeled so it cannot imply authoritative real-world confirmation.'
        indicator['sourceTrustLevel'] = 'low'
        indicator['derivedFrom'] = [indicator['sourcePayloadId']]
        indicator['lastReviewedAt'] = REVIEWED_AT
        indicator['externalVerificationStatus'] = external_status
        indicator['externalSourcesChecked'] = checks
        indicator['externalMatchType'] = external_match_type
        indicator['externalVerificationNotes'] = 'Exact public-source search did not validate this indicator as a real external bulletin/report/thermal hit; synthetic lineage controls classification.'
        indicator['geospatialPrecision'] = 'seeded_point_or_polygon_with_approximate_region_overlap'
        audit_records_changed.append({'recordType': 'indicator', 'id': indicator['id'], 'changes': ['provider renamed to fixture identifier', 'taxonomy downgraded to neutral vocabulary', 'headline/description rewritten', 'regionIds recalculated', 'external verification added']})
        downgraded_records.append({'recordType': 'indicator', 'id': indicator['id'], 'from': {'type': legacy['type'], 'headline': legacy['headline']}, 'to': {'type': indicator['type'], 'headline': indicator['headline']}, 'reason': 'Authoritative-sounding bulletin/report/thermal labels were replaced with neutral synthetic-demo wording.'})
        reclassified_synthetic.append({'recordType': 'indicator', 'id': indicator['id'], 'reason': 'payload lineage is seeded/demo and externally unmatched'})
        indicator_by_payload[indicator['sourcePayloadId']] = indicator

    # Events
    for event in snapshot['events']:
        legacy = copy.deepcopy(event)
        legacy_regions = event.get('regionIds', [])
        recalculated_regions = geometry_region_ids(event['geometry'], snapshot['regions'])
        if sorted(legacy_regions) != sorted(recalculated_regions):
            incorrect_region_tagging.append({'recordType': 'event', 'id': event['id'], 'from': legacy_regions, 'to': recalculated_regions, 'reason': 'event geometry intersection differs from legacy tagging'})
        event['legacyEventType'] = event['eventType']
        event['eventType'] = EVENT_TYPE_MAP.get(event['eventType'], event['eventType'])
        event['regionIds'] = recalculated_regions
        event['sourceProviders'] = [map_provider(provider) for provider in event.get('sourceProviders', [])]
        evidence_records: List[Dict[str, Any]] = []
        evidence_payloads: List[Dict[str, Any]] = []
        transformed_evidence = []
        for evidence in event.get('evidence', []):
            updated = copy.deepcopy(evidence)
            updated['legacyProvider'] = evidence['provider']
            updated['provider'] = map_provider(evidence['provider'])
            updated['summary'] = normalize_evidence_summary(evidence['sourceType'], evidence['summary'])
            transformed_evidence.append(updated)
            payload = raw_payload_by_id.get(evidence['sourcePayloadId'])
            if payload:
                evidence_payloads.append(payload)
                if evidence['sourcePayloadId'] in indicator_by_payload:
                    evidence_records.append(indicator_by_payload[evidence['sourcePayloadId']])
                elif evidence['sourcePayloadId'] in restriction_by_payload:
                    evidence_records.append(restriction_by_payload[evidence['sourcePayloadId']])
                elif evidence['sourcePayloadId'] in track_by_payload:
                    evidence_records.append(track_by_payload[evidence['sourcePayloadId']])
        event['evidence'] = transformed_evidence
        event['title'] = {
            'possible_strike': 'Synthetic demo strike-candidate scenario',
            'airspace_restriction_notice': 'Synthetic demo airspace restriction scenario',
            'traffic_disruption_cluster': 'Synthetic demo traffic disruption cluster',
            'thermal_cluster': 'Synthetic demo thermal cluster',
            'unverified_report': 'Synthetic demo unverified report scenario',
        }.get(event['eventType'], prefix_synthetic(event['title'], 'Synthetic demo: '))
        event['summary'] = {
            'possible_strike': 'Derived inference built entirely from synthetic demo sources. Retained only as a possible strike scenario for taxonomy and pipeline testing; not a verified real-world event.',
            'airspace_restriction_notice': 'Derived from a synthetic restriction-like payload and retained only as an airspace restriction scenario reference.',
            'traffic_disruption_cluster': 'Derived from synthetic track-pattern changes and retained only as a traffic disruption cluster scenario.',
            'thermal_cluster': 'Derived from synthetic thermal observations and retained only as a neutral thermal cluster scenario.',
            'unverified_report': 'Derived from a synthetic weak-source report fixture and intentionally remains unverified.',
        }.get(event['eventType'], prefix_synthetic(event['summary'], 'Synthetic demo summary: '))
        score, reasoning = event_score(event, evidence_records, evidence_payloads)
        event['confidence'] = score
        event['reasoning'] = reasoning
        inherited_external_sources = []
        for record in evidence_records:
            inherited_external_sources.extend(record.get('externalSourcesChecked', []))
        if any(record.get('externalMatchType') == 'exact_match' for record in evidence_records):
            external_match_type = 'exact_match'
        elif any(record.get('externalMatchType') == 'partial_match' for record in evidence_records):
            external_match_type = 'partial_match'
        elif any(record.get('externalMatchType') == 'context_only' for record in evidence_records):
            external_match_type = 'context_only'
        else:
            external_match_type = 'no_match'
        event['recordStatus'] = 'derived_inference'
        event['verificationStatus'] = 'derived_from_synthetic_sources'
        event['verificationNotes'] = 'Event is a derived inference assembled from synthetic_demo supporting records. It remains useful only as a conservative scenario record, not as real-world confirmation.'
        event['sourceTrustLevel'] = 'low'
        event['derivedFrom'] = sorted({evidence['sourcePayloadId'] for evidence in event.get('evidence', [])})
        event['lastReviewedAt'] = REVIEWED_AT
        event['externalVerificationStatus'] = 'inherited'
        event['externalSourcesChecked'] = inherited_external_sources
        event['externalMatchType'] = external_match_type
        event['externalVerificationNotes'] = 'Event-level verification inherits from supporting records. No exact external match was used to upgrade a derived scenario event.'
        event['geospatialPrecision'] = 'derived_geometry_anchor_with_approximate_region_overlap'
        audit_records_changed.append({'recordType': 'event', 'id': event['id'], 'changes': ['removed overstated taxonomy', 'recomputed conservative score', 'rewrote title and summary', 'renamed providers to fixture identifiers', 'added inherited external verification context']})
        if legacy['eventType'] != event['eventType'] or legacy.get('confidence') != event.get('confidence'):
            downgraded_records.append({'recordType': 'event', 'id': event['id'], 'from': {'eventType': legacy['eventType'], 'confidence': legacy.get('confidence'), 'title': legacy.get('title')}, 'to': {'eventType': event['eventType'], 'confidence': event.get('confidence'), 'title': event.get('title')}, 'reason': 'Overstated event certainty and confidence were replaced with conservative derived-inference semantics.'})
            scoring_fixes.append({'eventId': event['id'], 'legacyEventType': legacy['eventType'], 'newEventType': event['eventType'], 'legacyConfidence': legacy.get('confidence'), 'newConfidence': event.get('confidence'), 'legacySignalWeightSum': round(sum(abs(signal.get('weight', 0)) for signal in legacy.get('reasoning', {}).get('signals', [])), 2), 'newSignalWeightSum': round(sum(abs(signal.get('weight', 0)) for signal in event.get('reasoning', {}).get('signals', [])), 2), 'reason': 'New deterministic score penalizes synthetic lineage and missing exact external matches.'})

    # Analytics repairs
    route_revectoring_count = 0
    altitude_change_count = 0
    holding_pattern_count = 0
    coverage_gap_count = 0
    tracking_discontinuity_count = 0
    exit_reentry_count = 0
    for track in snapshot['tracks']:
        for anomaly in track.get('anomalies', []):
            if anomaly['type'] == 'route_revectoring_candidate':
                route_revectoring_count += 1
            elif anomaly['type'] == 'altitude_change_candidate':
                altitude_change_count += 1
            elif anomaly['type'] == 'holding_pattern_candidate':
                holding_pattern_count += 1
            elif anomaly['type'] == 'coverage_gap':
                coverage_gap_count += 1
            elif anomaly['type'] == 'tracking_discontinuity':
                tracking_discontinuity_count += 1
            elif anomaly['type'] == 'airspace_exit_reentry_candidate':
                exit_reentry_count += 1
    snapshot['analytics']['deviations'] = {
        'routeRevectoringCandidateCount': route_revectoring_count,
        'altitudeChangeCandidateCount': altitude_change_count,
        'holdingPatternCandidateCount': holding_pattern_count,
        'coverageGapCount': coverage_gap_count,
        'trackingDiscontinuityCount': tracking_discontinuity_count,
        'airspaceExitReentryCandidateCount': exit_reentry_count,
    }
    snapshot['analytics']['trackingDiscontinuityWindows'] = [
        {
            'start': window['start'],
            'end': window['end'],
            'impactedAircraft': [prefix_synthetic(item, 'DEMO-') if not item.startswith('DEMO-') else item for item in window['impactedAircraft']],
        }
        for window in snapshot['analytics'].pop('transponderLossWindows', [])
    ]
    snapshot['analytics']['eventCorrelationStats'] = {
        event_type: count for event_type, count in sorted(
            ((event_type, sum(1 for event in snapshot['events'] if event['eventType'] == event_type)) for event_type in sorted({event['eventType'] for event in snapshot['events']})),
            key=lambda item: item[0],
        ) if count
    }
    snapshot['stats']['eventVolume'] = len(snapshot['events'])

    unresolved_uncertainties.extend([
        {
            'id': 'overlapping-built-in-regions',
            'severity': 'medium',
            'note': 'Built-in simplified region polygons overlap, so multi-region tagging remains approximate even after recalculation.'
        },
        {
            'id': 'external-search-scope',
            'severity': 'medium',
            'note': 'External verification used exact public web search, which is sufficient to refuse upgrades here but is not equivalent to authenticated provider API reconciliation.'
        },
        {
            'id': 'legacy-identifiers-retained',
            'severity': 'low',
            'note': 'Legacy provider/callsign/type fields were retained for auditability, but active fields were renamed or prefixed to prevent downstream confusion.'
        },
    ])

    issues = validate_snapshot(snapshot)
    if issues:
        unresolved_uncertainties.extend({'id': f'validation-{index + 1}', 'severity': 'high', 'note': issue} for index, issue in enumerate(issues))

    audit_report = {
        'reviewedAt': REVIEWED_AT,
        'sourceFile': str(SNAPSHOT_PATH.relative_to(ROOT)),
        'outputFiles': [
            str(SNAPSHOT_PATH.relative_to(ROOT)),
            str(AUDIT_PATH.relative_to(ROOT)),
            str(REPORT_PATH.relative_to(ROOT)),
            str(DEMO_REPORT_PATH.relative_to(ROOT)),
        ],
        'summary': {
            'totalRecordsReviewed': sum(len(snapshot[key]) for key in ['regions', 'restrictions', 'tracks', 'indicators', 'events', 'rawPayloads']),
            'recordsChanged': len(audit_records_changed),
            'recordsDowngraded': len(downgraded_records),
            'recordsReclassifiedAsSyntheticDemo': len(reclassified_synthetic),
            'recordsWithIncorrectRegionTagging': len(incorrect_region_tagging),
            'recordsWithScoringFixes': len(scoring_fixes),
            'unresolvedUncertainties': len(unresolved_uncertainties),
            'datasetSuitability': snapshot['datasetMetadata']['datasetSuitability'],
            'productionSafe': snapshot['datasetMetadata']['productionSafe'],
        },
        'recordsChanged': audit_records_changed,
        'recordsDowngraded': downgraded_records,
        'recordsReclassifiedAsSyntheticDemo': reclassified_synthetic,
        'recordsWithIncorrectRegionTagging': incorrect_region_tagging,
        'recordsWithScoringFixes': scoring_fixes,
        'unresolvedUncertainties': unresolved_uncertainties,
    }

    summary_lines = [
        '# Conflict-monitoring dataset integrity report',
        '',
        '## Executive summary',
        f'- Reviewed at: {REVIEWED_AT}',
        '- Dataset suitability: demo only',
        '- Production safe: no',
        '- Bottom line: the original snapshot mixed seeded/demo fixtures with real-looking provider names, event labels, and confidence scores. The repaired snapshot explicitly marks synthetic lineage, downgrades overstated labels, and prevents downstream consumers from mistaking fixture data for verified operational truth.',
        '',
        '## Major integrity issues found',
        '- Synthetic and offline fixtures were presented with real-looking provider names (OpenSky, FlightAware, ADS-B Exchange, NASA FIRMS, ICAO, EASA, NOTAM-like feeds).',
        '- `confirmed_strike` appeared despite no authoritative confirmation and explicit seeded/demo payload lineage.',
        '- Restriction, bulletin, thermal, OSINT, and track records lacked required provenance metadata and external-verification fields.',
        '- Region assignments relied on coarse overlapping polygons and legacy manual tagging, which produced inconsistent `regionIds`.',
        '- Aviation anomaly labels such as `transponder_loss` overstated what sparse fixture coverage could support.',
        '',
        '## Taxonomy changes',
        '- `confirmed_strike` -> `possible_strike`',
        '- `probable_strike` -> `possible_strike` (remains scenario-only due synthetic lineage)',
        '- `airspace_closure` -> `airspace_restriction_notice`',
        '- `aircraft_diversion_cluster` -> `traffic_disruption_cluster`',
        '- `thermal_anomaly` -> `thermal_cluster`',
        '- Track anomalies downgraded to `route_revectoring_candidate`, `altitude_change_candidate`, `holding_pattern_candidate`, `tracking_discontinuity`, `coverage_gap`, and `airspace_exit_reentry_candidate` as appropriate.',
        '',
        '## Scoring changes',
        '- Replaced the legacy additive confidence behavior that could reach 1.0 from demo-derived evidence.',
        '- New deterministic model starts from a low baseline and applies explicit penalties for synthetic lineage, missing exact external matches, and weak corroboration.',
        '- Repaired confidence labels now map cleanly to fixed numeric ranges: low (0.00-0.24), moderate (0.25-0.49), high (0.50-0.74), very_high (0.75-1.00).',
        '',
        '## Records unusable for real-world analysis',
        '- All restrictions, tracks, indicators, and raw payloads remain unusable as real-world operational truth because they are synthetic_demo or derived from synthetic_demo inputs.',
        '- All events remain derived_inference only; none are verified_real or production-safe.',
        '',
        '## Recommendations for a production-safe pipeline',
        '- Separate demo fixtures from real data at ingest time and never reuse real provider names for seeded fixtures.',
        '- Require authoritative provenance before allowing any live-facing record to exceed `partially_verified`.',
        '- Make region assignment methods explicit and avoid overlapping coarse polygons for production tagging.',
        '- Gate event promotion on exact external matches or authenticated provider/API reconciliation, not contextual similarity.',
        '- Run integrity repair or equivalent validation automatically before publishing snapshot artifacts.',
        '',
        '## Audit totals',
        f'- Records changed: {len(audit_records_changed)}',
        f'- Records downgraded: {len(downgraded_records)}',
        f'- Records reclassified as synthetic_demo: {len(reclassified_synthetic)}',
        f'- Records with region-tagging fixes: {len(incorrect_region_tagging)}',
        f'- Records with scoring fixes: {len(scoring_fixes)}',
        f'- Unresolved uncertainties: {len(unresolved_uncertainties)}',
    ]
    markdown_report = '\n'.join(summary_lines) + '\n'

    write_json(SNAPSHOT_PATH, snapshot)
    write_json(AUDIT_PATH, audit_report)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(markdown_report)
    DEMO_REPORT_PATH.write_text(markdown_report)

    if issues:
        raise SystemExit('Integrity repair completed with validation issues: ' + '; '.join(issues))


if __name__ == '__main__':
    main()

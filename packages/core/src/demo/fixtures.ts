import type {
  AirspaceRestriction,
  ConflictIndicator,
  ProviderTrackObservation,
  RawSourcePayload,
  RegionDefinition
} from '../types/domain';

export const DEMO_NOW = '2026-03-29T00:00:00.000Z';

const builtInSource = 'built_in' as const;

export const defaultRegions: RegionDefinition[] = [
  {
    id: 'iran',
    name: 'Iran',
    description: 'Built-in monitoring polygon for Iranian territory (simplified bounding geometry for seeded demo usage).',
    source: builtInSource,
    createdAt: DEMO_NOW,
    tags: ['country', 'default'],
    bbox: { minLon: 44.0, minLat: 25.0, maxLon: 63.5, maxLat: 39.8 },
    geometry: { type: 'Polygon', coordinates: [[[44.0, 25.0], [63.5, 25.0], [63.5, 39.8], [44.0, 39.8], [44.0, 25.0]]] }
  },
  {
    id: 'israel',
    name: 'Israel',
    description: 'Built-in monitoring polygon for Israel (simplified seeded geometry).',
    source: builtInSource,
    createdAt: DEMO_NOW,
    tags: ['country', 'default'],
    bbox: { minLon: 34.2, minLat: 29.4, maxLon: 35.9, maxLat: 33.5 },
    geometry: { type: 'Polygon', coordinates: [[[34.2, 29.4], [35.9, 29.4], [35.9, 33.5], [34.2, 33.5], [34.2, 29.4]]] }
  },
  {
    id: 'arabian-peninsula',
    name: 'Arabian Peninsula',
    description: 'Built-in polygon covering the Arabian Peninsula monitoring zone.',
    source: builtInSource,
    createdAt: DEMO_NOW,
    tags: ['region', 'default'],
    bbox: { minLon: 34.0, minLat: 12.0, maxLon: 60.0, maxLat: 32.0 },
    geometry: { type: 'Polygon', coordinates: [[[34.0, 12.0], [60.0, 12.0], [60.0, 32.0], [34.0, 32.0], [34.0, 12.0]]] }
  },
  {
    id: 'eastern-mediterranean',
    name: 'Eastern Mediterranean',
    description: 'Built-in polygon covering the Eastern Mediterranean maritime monitoring zone.',
    source: builtInSource,
    createdAt: DEMO_NOW,
    tags: ['region', 'default'],
    bbox: { minLon: 24.0, minLat: 30.0, maxLon: 37.0, maxLat: 38.0 },
    geometry: { type: 'Polygon', coordinates: [[[24.0, 30.0], [37.0, 30.0], [37.0, 38.0], [24.0, 38.0], [24.0, 30.0]]] }
  }
];

const payloads: RawSourcePayload[] = [];
const tracksByProvider: Record<string, ProviderTrackObservation[]> = {
  opensky: [],
  adsb_exchange: [],
  flightaware: []
};
const indicatorsByProvider: Record<string, ConflictIndicator[]> = {
  icao_bulletins: [],
  easa_bulletins: [],
  nasa_firms: [],
  osint_news: []
};
const restrictionsByProvider: Record<string, AirspaceRestriction[]> = {
  notam_feed: []
};

const pushPayload = (payload: RawSourcePayload): string => {
  payloads.push(payload);
  return payload.id;
};

const attribution = (name: string, note: string): RawSourcePayload['attribution'] => ({
  name,
  note,
  termsUrl: 'https://example.invalid/terms'
});

const addTrack = (provider: keyof typeof tracksByProvider, track: Omit<ProviderTrackObservation, 'provider' | 'sourcePayloadId'>, raw: Record<string, unknown>): void => {
  const payloadId = pushPayload({
    id: `raw-${provider}-${track.id}`,
    provider,
    sourceType: 'track',
    ingestedAt: DEMO_NOW,
    receivedAt: track.observedAt,
    raw,
    attribution: attribution(provider, 'Seeded provider payload for offline/demo mode.')
  });
  const bucket = tracksByProvider[provider];
  if (!bucket) throw new Error(`Unknown track provider: ${provider}`);
  bucket.push({ ...track, provider, sourcePayloadId: payloadId });
};

const addIndicator = (provider: keyof typeof indicatorsByProvider, indicator: Omit<ConflictIndicator, 'provider' | 'sourcePayloadId'>, raw: Record<string, unknown>): void => {
  const payloadId = pushPayload({
    id: `raw-${provider}-${indicator.id}`,
    provider,
    sourceType: indicator.type === 'thermal_anomaly' ? 'conflict_indicator' : 'bulletin',
    ingestedAt: DEMO_NOW,
    receivedAt: indicator.observedAt,
    raw,
    attribution: attribution(provider, 'Seeded bulletin/indicator payload for offline/demo mode.')
  });
  const bucket = indicatorsByProvider[provider];
  if (!bucket) throw new Error(`Unknown indicator provider: ${provider}`);
  bucket.push({ ...indicator, provider, sourcePayloadId: payloadId });
};

const addRestriction = (provider: keyof typeof restrictionsByProvider, restriction: Omit<AirspaceRestriction, 'provider' | 'sourcePayloadId'>, raw: Record<string, unknown>): void => {
  const payloadId = pushPayload({
    id: `raw-${provider}-${restriction.id}`,
    provider,
    sourceType: 'restriction',
    ingestedAt: DEMO_NOW,
    receivedAt: restriction.observedAt,
    raw,
    attribution: attribution(provider, 'Seeded restriction payload for offline/demo mode.')
  });
  const bucket = restrictionsByProvider[provider];
  if (!bucket) throw new Error(`Unknown restriction provider: ${provider}`);
  bucket.push({ ...restriction, provider, sourcePayloadId: payloadId });
};

// Track fixtures: deliberately overlapping across providers to exercise reconciliation.
[
  ['opensky', { id: 'obs-1a', observedAt: '2026-03-28T16:00:00.000Z', icao24: 'abc001', callsign: 'EM9001', latitude: 33.18, longitude: 35.42, altitudeFt: 33000, heading: 178, speedKts: 451, origin: 'ATH', destination: 'TLV', aircraftType: 'A320', squawk: '4312' }, { source: 'opensky-live-sample', lat: 33.18, lon: 35.42 }],
  ['adsb_exchange', { id: 'obs-1b', observedAt: '2026-03-28T16:02:00.000Z', icao24: 'abc001', callsign: 'EM9001', latitude: 33.19, longitude: 35.4, altitudeFt: 33100, heading: 176, speedKts: 452, origin: 'ATH', destination: 'TLV', aircraftType: 'A320', squawk: '4312' }, { source: 'adsb-sample', hex: 'abc001' }],
  ['flightaware', { id: 'obs-1c', observedAt: '2026-03-28T16:01:00.000Z', icao24: 'abc001', callsign: 'EM9001', latitude: 33.17, longitude: 35.43, altitudeFt: 33000, heading: 177, speedKts: 449, origin: 'ATH', destination: 'TLV', aircraftType: 'A320', squawk: '4312' }, { source: 'flightaware-sample', ident: 'EM9001' }],
  ['opensky', { id: 'obs-2a', observedAt: '2026-03-28T16:18:00.000Z', icao24: 'abc001', callsign: 'EM9001', latitude: 33.08, longitude: 35.78, altitudeFt: 33000, heading: 186, speedKts: 449, origin: 'ATH', destination: 'TLV', aircraftType: 'A320', squawk: '4312' }, { source: 'opensky-live-sample', lat: 33.08, lon: 35.78 }],
  ['adsb_exchange', { id: 'obs-2b', observedAt: '2026-03-28T16:19:00.000Z', icao24: 'abc001', callsign: 'EM9001', latitude: 33.07, longitude: 35.79, altitudeFt: 32950, heading: 188, speedKts: 448, origin: 'ATH', destination: 'TLV', aircraftType: 'A320', squawk: '4312' }, { source: 'adsb-sample', hex: 'abc001' }],
  ['flightaware', { id: 'obs-3c', observedAt: '2026-03-28T16:31:00.000Z', icao24: 'abc001', callsign: 'EM9001', latitude: 33.02, longitude: 36.18, altitudeFt: 32800, heading: 94, speedKts: 447, origin: 'ATH', destination: 'TLV', aircraftType: 'A320', squawk: '4312' }, { source: 'flightaware-sample', ident: 'EM9001' }],
  ['opensky', { id: 'obs-4a', observedAt: '2026-03-28T16:45:00.000Z', icao24: 'abc001', callsign: 'EM9001', latitude: 33.19, longitude: 35.91, altitudeFt: 28000, heading: 242, speedKts: 398, origin: 'ATH', destination: 'TLV', aircraftType: 'A320', squawk: '4312' }, { source: 'opensky-live-sample', lat: 33.19, lon: 35.91 }],
  ['adsb_exchange', { id: 'obs-5b', observedAt: '2026-03-28T17:09:00.000Z', icao24: 'abc001', callsign: 'EM9001', latitude: 33.41, longitude: 35.58, altitudeFt: 26100, heading: 260, speedKts: 381, origin: 'ATH', destination: 'LCA', aircraftType: 'A320', squawk: '4312' }, { source: 'adsb-sample', hex: 'abc001' }],

  ['opensky', { id: 'mea-1', observedAt: '2026-03-28T17:05:00.000Z', icao24: 'def002', callsign: 'MEA440', latitude: 33.12, longitude: 35.71, altitudeFt: 34000, heading: 193, speedKts: 463, origin: 'BEY', destination: 'AUH', aircraftType: 'B738', squawk: '5531' }, { source: 'opensky-live-sample', lat: 33.12, lon: 35.71 }],
  ['adsb_exchange', { id: 'mea-2', observedAt: '2026-03-28T17:20:00.000Z', icao24: 'def002', callsign: 'MEA440', latitude: 33.01, longitude: 35.95, altitudeFt: 34020, heading: 205, speedKts: 461, origin: 'BEY', destination: 'AUH', aircraftType: 'B738', squawk: '5531' }, { source: 'adsb-sample', hex: 'def002' }],
  ['flightaware', { id: 'mea-3', observedAt: '2026-03-28T17:51:00.000Z', icao24: 'def002', callsign: 'MEA440', latitude: 32.86, longitude: 36.11, altitudeFt: 33980, heading: 210, speedKts: 458, origin: 'BEY', destination: 'AUH', aircraftType: 'B738', squawk: '5531' }, { source: 'flightaware-sample', ident: 'MEA440' }],
  ['opensky', { id: 'mea-4', observedAt: '2026-03-28T18:25:00.000Z', icao24: 'def002', callsign: 'MEA440', latitude: 33.04, longitude: 35.79, altitudeFt: 26200, heading: 318, speedKts: 355, origin: 'BEY', destination: 'AUH', aircraftType: 'B738', squawk: '5531' }, { source: 'opensky-live-sample', lat: 33.04, lon: 35.79 }],

  ['opensky', { id: 'gfa-1', observedAt: '2026-03-28T12:00:00.000Z', icao24: 'ghi003', callsign: 'GFA221', latitude: 25.31, longitude: 51.61, altitudeFt: 36000, heading: 268, speedKts: 472, origin: 'DOH', destination: 'AMM', aircraftType: 'A321', squawk: '4421' }, { source: 'opensky-live-sample' }],
  ['adsb_exchange', { id: 'gfa-2', observedAt: '2026-03-28T12:20:00.000Z', icao24: 'ghi003', callsign: 'GFA221', latitude: 24.7, longitude: 49.2, altitudeFt: 36000, heading: 266, speedKts: 471, origin: 'DOH', destination: 'AMM', aircraftType: 'A321', squawk: '4421' }, { source: 'adsb-sample' }],
  ['flightaware', { id: 'gfa-3', observedAt: '2026-03-28T12:40:00.000Z', icao24: 'ghi003', callsign: 'GFA221', latitude: 24.1, longitude: 46.8, altitudeFt: 36020, heading: 265, speedKts: 470, origin: 'DOH', destination: 'AMM', aircraftType: 'A321', squawk: '4421' }, { source: 'flightaware-sample' }],
  ['opensky', { id: 'gfa-4', observedAt: '2026-03-28T13:00:00.000Z', icao24: 'ghi003', callsign: 'GFA221', latitude: 23.5, longitude: 44.2, altitudeFt: 30000, heading: 257, speedKts: 428, origin: 'DOH', destination: 'AMM', aircraftType: 'A321', squawk: '4421' }, { source: 'opensky-live-sample' }],
  ['adsb_exchange', { id: 'gfa-5', observedAt: '2026-03-28T13:10:00.000Z', icao24: 'ghi003', callsign: 'GFA221', latitude: 23.1, longitude: 42.9, altitudeFt: 22000, heading: 254, speedKts: 382, origin: 'DOH', destination: 'AMM', aircraftType: 'A321', squawk: '4421' }, { source: 'adsb-sample' }],

  ['opensky', { id: 'ira-1', observedAt: '2026-03-28T09:00:00.000Z', icao24: 'jkl004', callsign: 'IRA781', latitude: 35.7, longitude: 51.4, altitudeFt: 32000, heading: 275, speedKts: 418, origin: 'THR', destination: 'BGW', aircraftType: 'B742', squawk: '6701' }, { source: 'opensky-live-sample' }],
  ['flightaware', { id: 'ira-2', observedAt: '2026-03-28T09:10:00.000Z', icao24: 'jkl004', callsign: 'IRA781', latitude: 35.6, longitude: 50.8, altitudeFt: 32050, heading: 274, speedKts: 419, origin: 'THR', destination: 'BGW', aircraftType: 'B742', squawk: '6701' }, { source: 'flightaware-sample' }],
  ['opensky', { id: 'ira-3', observedAt: '2026-03-28T09:20:00.000Z', icao24: 'jkl004', callsign: 'IRA781', latitude: 35.5, longitude: 50.1, altitudeFt: 24900, heading: 270, speedKts: 392, origin: 'THR', destination: 'BGW', aircraftType: 'B742', squawk: '6701' }, { source: 'opensky-live-sample' }],
  ['flightaware', { id: 'ira-4', observedAt: '2026-03-28T09:50:00.000Z', icao24: 'jkl004', callsign: 'IRA781', latitude: 35.7, longitude: 49.7, altitudeFt: 24880, heading: 12, speedKts: 390, origin: 'THR', destination: 'BGW', aircraftType: 'B742', squawk: '6701' }, { source: 'flightaware-sample' }],

  ['adsb_exchange', { id: 'kac-1', observedAt: '2026-03-28T18:00:00.000Z', icao24: 'mno005', callsign: 'KAC778', latitude: 29.5, longitude: 47.8, altitudeFt: 33000, heading: 232, speedKts: 455, origin: 'KWI', destination: 'CAI', aircraftType: 'A320', squawk: '5112' }, { source: 'adsb-sample' }],
  ['opensky', { id: 'kac-2', observedAt: '2026-03-28T18:10:00.000Z', icao24: 'mno005', callsign: 'KAC778', latitude: 28.8, longitude: 46.5, altitudeFt: 33010, heading: 230, speedKts: 454, origin: 'KWI', destination: 'CAI', aircraftType: 'A320', squawk: '5112' }, { source: 'opensky-live-sample' }],
  ['adsb_exchange', { id: 'kac-3', observedAt: '2026-03-28T18:20:00.000Z', icao24: 'mno005', callsign: 'KAC778', latitude: 27.9, longitude: 45.2, altitudeFt: 32990, heading: 228, speedKts: 453, origin: 'KWI', destination: 'CAI', aircraftType: 'A320', squawk: '5112' }, { source: 'adsb-sample' }],
  ['opensky', { id: 'kac-4', observedAt: '2026-03-28T18:55:00.000Z', icao24: 'mno005', callsign: 'KAC778', latitude: 27.3, longitude: 43.5, altitudeFt: 32980, heading: 225, speedKts: 451, origin: 'KWI', destination: 'CAI', aircraftType: 'A320', squawk: '5112' }, { source: 'opensky-live-sample' }],

  ['flightaware', { id: 'axy-1', observedAt: '2026-03-28T19:00:00.000Z', icao24: 'pqr006', callsign: 'AXY330', latitude: 32.0, longitude: 34.7, altitudeFt: 12000, heading: 90, speedKts: 205, origin: 'TLV', destination: 'LCA', aircraftType: 'B737', squawk: '4107' }, { source: 'flightaware-sample' }],
  ['opensky', { id: 'axy-2', observedAt: '2026-03-28T19:10:00.000Z', icao24: 'pqr006', callsign: 'AXY330', latitude: 32.05, longitude: 34.8, altitudeFt: 12020, heading: 180, speedKts: 198, origin: 'TLV', destination: 'LCA', aircraftType: 'B737', squawk: '4107' }, { source: 'opensky-live-sample' }],
  ['flightaware', { id: 'axy-3', observedAt: '2026-03-28T19:20:00.000Z', icao24: 'pqr006', callsign: 'AXY330', latitude: 32.0, longitude: 34.9, altitudeFt: 12010, heading: 270, speedKts: 200, origin: 'TLV', destination: 'LCA', aircraftType: 'B737', squawk: '4107' }, { source: 'flightaware-sample' }],
  ['opensky', { id: 'axy-4', observedAt: '2026-03-28T19:30:00.000Z', icao24: 'pqr006', callsign: 'AXY330', latitude: 31.95, longitude: 34.8, altitudeFt: 11980, heading: 0, speedKts: 195, origin: 'TLV', destination: 'LCA', aircraftType: 'B737', squawk: '4107' }, { source: 'opensky-live-sample' }],
  ['flightaware', { id: 'axy-5', observedAt: '2026-03-28T19:40:00.000Z', icao24: 'pqr006', callsign: 'AXY330', latitude: 32.0, longitude: 34.7, altitudeFt: 12000, heading: 90, speedKts: 198, origin: 'TLV', destination: 'LCA', aircraftType: 'B737', squawk: '4107' }, { source: 'flightaware-sample' }],

  ['flightaware', { id: 'lowcov-1', observedAt: '2026-03-27T22:30:00.000Z', icao24: 'stu007', callsign: 'DMS102', latitude: 15.2, longitude: 44.4, altitudeFt: 28000, heading: 120, speedKts: 340, origin: 'JED', destination: 'MCT', aircraftType: 'B752', squawk: '6021' }, { source: 'flightaware-sample' }],
  ['flightaware', { id: 'lowcov-2', observedAt: '2026-03-27T22:58:00.000Z', icao24: 'stu007', callsign: 'DMS102', latitude: 15.1, longitude: 46.2, altitudeFt: 27950, heading: 118, speedKts: 338, origin: 'JED', destination: 'MCT', aircraftType: 'B752', squawk: '6021' }, { source: 'flightaware-sample' }]
].forEach(([provider, track, raw]) => addTrack(provider as keyof typeof tracksByProvider, track as Omit<ProviderTrackObservation, 'provider' | 'sourcePayloadId'>, raw as Record<string, unknown>));

addRestriction('notam_feed', {
  id: 'restr-1',
  title: 'Temporary closure east of Cyprus / Levant corridor',
  observedAt: '2026-03-28T17:10:00.000Z',
  expiresAt: '2026-03-29T05:00:00.000Z',
  geometry: { type: 'Polygon', coordinates: [[[35.35, 32.9], [36.1, 32.9], [36.1, 33.45], [35.35, 33.45], [35.35, 32.9]]] },
  regionIds: ['eastern-mediterranean'],
  restrictionLevel: 'closure',
  summary: 'Seeded NOTAM-like closure affecting the Levantine maritime corridor.',
}, { notam: 'DEMO-LEVANT-01', purpose: 'seeded-demo' });

addRestriction('notam_feed', {
  id: 'restr-2',
  title: 'Avoidance advisory over northern Arabian Peninsula transit lanes',
  observedAt: '2026-03-28T12:45:00.000Z',
  expiresAt: '2026-03-29T02:00:00.000Z',
  geometry: { type: 'Polygon', coordinates: [[[42.5, 22.4], [45.0, 22.4], [45.0, 24.6], [42.5, 24.6], [42.5, 22.4]]] },
  regionIds: ['arabian-peninsula'],
  restrictionLevel: 'avoidance',
  summary: 'Seeded advisory to avoid a narrow Gulf-to-Levant airway segment.',
}, { notam: 'DEMO-GULF-02', purpose: 'seeded-demo' });

addIndicator('icao_bulletins', {
  id: 'bulletin-1',
  type: 'icao_bulletin',
  observedAt: '2026-03-28T16:50:00.000Z',
  geometry: { type: 'Point' as const, coordinates: [35.74, 33.18] as [number, number] },
  regionIds: ['eastern-mediterranean'],
  headline: 'ICAO conflict-zone advisory references tactical disruption in the Eastern Mediterranean corridor',
  description: 'Seeded ICAO-style bulletin highlighting elevated tactical disruption risk and rerouting instructions.',
  severity: 'warning',
  independentSourceCount: 1,
  metadata: { bulletinId: 'ICAO-DEMO-17' }
}, { bulletinId: 'ICAO-DEMO-17', severity: 'warning' });

addIndicator('easa_bulletins', {
  id: 'bulletin-2',
  type: 'easa_bulletin',
  observedAt: '2026-03-28T12:35:00.000Z',
  geometry: { type: 'Point' as const, coordinates: [43.7, 23.6] as [number, number] },
  regionIds: ['arabian-peninsula'],
  headline: 'EASA conflict-zone bulletin notes tactical risk for northern Arabian transit lanes',
  description: 'Seeded EASA-style advisory coinciding with a cautionary reroute corridor.',
  severity: 'advisory',
  independentSourceCount: 1,
  metadata: { bulletinId: 'EASA-DEMO-9' }
}, { bulletinId: 'EASA-DEMO-9', severity: 'advisory' });

const thermalFixtures: Array<{ id: string; observedAt: string; geometry: { type: 'Point'; coordinates: [number, number] } }> = [
  { id: 'thermal-1', observedAt: '2026-03-28T17:41:00.000Z', geometry: { type: 'Point', coordinates: [35.58, 33.19] } },
  { id: 'thermal-2', observedAt: '2026-03-28T18:02:00.000Z', geometry: { type: 'Point', coordinates: [35.62, 33.22] } },
  { id: 'thermal-3', observedAt: '2026-03-28T18:18:00.000Z', geometry: { type: 'Point', coordinates: [35.67, 33.16] } },
  { id: 'thermal-4', observedAt: '2026-03-28T19:22:00.000Z', geometry: { type: 'Point', coordinates: [34.87, 31.96] } },
  { id: 'thermal-5', observedAt: '2026-03-28T19:46:00.000Z', geometry: { type: 'Point', coordinates: [34.84, 31.98] } }
];

thermalFixtures.forEach((item) => addIndicator('nasa_firms', {
  id: item.id,
  type: 'thermal_anomaly',
  observedAt: item.observedAt,
  geometry: item.geometry,
  regionIds: item.id.startsWith('thermal-4') || item.id.startsWith('thermal-5') ? ['israel'] : ['eastern-mediterranean'],
  headline: `FIRMS thermal hit ${item.id}`,
  description: 'Seeded thermal anomaly used for offline clustering and strike inference demos.',
  severity: 'warning',
  independentSourceCount: 1,
  metadata: { brightness: 336, confidence: 'nominal' }
}, { firmsId: item.id, brightness: 336 }));

const osintFixtures: Array<Omit<ConflictIndicator, 'provider' | 'sourcePayloadId'>> = [
  {
    id: 'osint-1',
    type: 'osint_report',
    observedAt: '2026-03-28T17:55:00.000Z',
    geometry: { type: 'Point', coordinates: [35.61, 33.2] },
    regionIds: ['eastern-mediterranean'],
    headline: 'Multiple local channels mention impact sounds east of Cyprus corridor',
    description: 'Cross-posted local observer reports aligned with maritime reroutes.',
    severity: 'warning',
    independentSourceCount: 2,
    metadata: { citations: ['source-a', 'source-b'] }
  },
  {
    id: 'news-1',
    type: 'news_report',
    observedAt: '2026-03-28T18:10:00.000Z',
    geometry: { type: 'Point', coordinates: [35.63, 33.18] },
    regionIds: ['eastern-mediterranean'],
    headline: 'Regional desk reports emergency reroutes linked to suspected strike activity',
    description: 'Seeded news aggregation item used to corroborate the cluster.',
    severity: 'warning',
    independentSourceCount: 2,
    metadata: { citations: ['desk-1', 'desk-2'] }
  },
  {
    id: 'osint-2',
    type: 'osint_report',
    observedAt: '2026-03-28T19:38:00.000Z',
    geometry: { type: 'Point', coordinates: [34.85, 31.97] },
    regionIds: ['israel'],
    headline: 'Two independent reports mention flashes near the southern Israeli corridor',
    description: 'Seeded dual-source OSINT report with no official corroboration.',
    severity: 'warning',
    independentSourceCount: 2,
    metadata: { citations: ['observer-1', 'observer-2'] }
  },
  {
    id: 'osint-3',
    type: 'osint_report',
    observedAt: '2026-03-28T10:30:00.000Z',
    geometry: { type: 'Point', coordinates: [50.2, 35.6] },
    regionIds: ['iran'],
    headline: 'Single channel claims blast near western Iran',
    description: 'Weak-source report intentionally retained as unverified.',
    severity: 'info',
    independentSourceCount: 1,
    metadata: { citations: ['single-channel'] }
  }
];

osintFixtures.forEach((indicator) => addIndicator('osint_news', indicator, { headline: indicator.headline, citations: indicator.metadata.citations }));

export const getTrackFixtures = (provider: string): ProviderTrackObservation[] => tracksByProvider[provider] ?? [];
export const getIndicatorFixtures = (provider: string): ConflictIndicator[] => indicatorsByProvider[provider] ?? [];
export const getRestrictionFixtures = (provider: string): AirspaceRestriction[] => restrictionsByProvider[provider] ?? [];
export const getRawPayloadFixtures = (): RawSourcePayload[] => [...payloads];

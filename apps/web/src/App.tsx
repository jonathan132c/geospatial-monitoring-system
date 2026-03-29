import { useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polygon, Polyline, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { EventDetails } from './components/EventDetails';
import { FilterPanel, type Filters } from './components/FilterPanel';
import { apiBase, getJson } from './lib/api';
import { eventTypeLabel } from './lib/eventLabels';
import './styles/app.css';

interface Track {
  id: string;
  callsign?: string;
  aircraftType?: string;
  providers: string[];
  points: Array<{ latitude: number; longitude: number; altitudeFt?: number }>;
}

interface EventItem {
  id: string;
  eventType: string;
  title: string;
  displayTitle?: string;
  publicLabel?: string;
  summary: string;
  confidence: number;
  safetyNotice?: string;
  reasoning: { signals: Array<{ label: string; weight: number; effect: string; evidence: string }> };
  evidence: Array<{ sourcePayloadId: string; provider: string; summary: string; observedAt: string }>;
  startedAt: string;
  endedAt: string;
  geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'Polygon'; coordinates: [number, number][][] };
}

interface Restriction {
  id: string;
  title: string;
  geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'Polygon'; coordinates: [number, number][][] };
}

interface Region {
  id: string;
  name: string;
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
}

interface Health {
  generatedAt: string;
  safetyProfile?: {
    notice?: string;
  };
}

const defaultFilters: Filters = {
  region: '',
  windowHours: 72,
  minConfidence: 0.25,
  sourceType: '',
  aircraftType: ''
};

const eventColor = (eventType: string): string => {
  switch (eventType) {
    case 'confirmed_strike': return '#ef4444';
    case 'probable_strike': return '#f97316';
    case 'airspace_closure': return '#8b5cf6';
    case 'thermal_anomaly': return '#eab308';
    case 'aircraft_diversion_cluster': return '#06b6d4';
    default: return '#94a3b8';
  }
};

export default function App() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('2026-03-29T00:00:00.000Z');
  const [safetyNotice, setSafetyNotice] = useState<string>('Non-operational public-source analytical demo. Delayed/coarsened outputs only; no tactical guidance.');

  useEffect(() => {
    void getJson<Health>('/health').then((health) => {
      setGeneratedAt(health.generatedAt);
      if (health.safetyProfile?.notice) {
        setSafetyNotice(health.safetyProfile.notice);
      }
    }).catch(() => undefined);
    void getJson<{ items: Region[] }>('/regions').then((response) => setRegions(response.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const end = new Date(generatedAt);
    const start = new Date(end.getTime() - filters.windowHours * 60 * 60 * 1000);
    const params = new URLSearchParams();
    if (filters.region) params.set('region', filters.region);
    if (filters.sourceType) params.set('sourceType', filters.sourceType);
    if (filters.minAltitude !== undefined) params.set('minAltitude', String(filters.minAltitude));
    if (filters.maxAltitude !== undefined) params.set('maxAltitude', String(filters.maxAltitude));
    params.set('start', start.toISOString());
    params.set('end', end.toISOString());

    const eventParams = new URLSearchParams(params.toString());
    eventParams.set('minConfidence', String(filters.minConfidence));

    void Promise.all([
      getJson<{ items: Track[] }>(`/tracks?${params.toString()}`),
      getJson<{ items: EventItem[] }>(`/events?${eventParams.toString()}`),
      getJson<{ items: Restriction[] }>(`/airspace/restrictions?${params.toString()}`)
    ]).then(([tracksResponse, eventsResponse, restrictionsResponse]) => {
      setTracks(tracksResponse.items);
      setEvents(eventsResponse.items);
      setRestrictions(restrictionsResponse.items);
    }).catch((error) => {
      console.error('Failed to load dashboard data', error);
    });
  }, [filters, generatedAt]);

  const filteredTracks = useMemo(
    () => tracks.filter((track) => !filters.aircraftType || track.aircraftType === filters.aircraftType),
    [filters.aircraftType, tracks]
  );

  const aircraftTypes = useMemo(
    () => [...new Set(tracks.map((track) => track.aircraftType).filter(Boolean) as string[])].sort(),
    [tracks]
  );

  const densityOverlay = useMemo(() => {
    const grouped = new Map<string, { lat: number; lon: number; count: number }>();
    for (const track of filteredTracks) {
      const first = track.points[0];
      if (!first) continue;
      const key = `${Math.round(first.latitude)}:${Math.round(first.longitude)}`;
      const existing = grouped.get(key) ?? { lat: first.latitude, lon: first.longitude, count: 0 };
      existing.count += 1;
      grouped.set(key, existing);
    }
    return [...grouped.values()];
  }, [filteredTracks]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Public-source historical monitoring demo</h1>
        <p className="subtle">API: {apiBase}</p>
        <section className="panel safety-banner">
          <strong>Non-operational use only.</strong>
          <p>{safetyNotice}</p>
          <p className="subtle">For research, journalism, humanitarian situational awareness, and offline analytical prototyping only.</p>
        </section>
        <FilterPanel filters={filters} onChange={setFilters} aircraftTypes={aircraftTypes} />
        <section className="panel timeline">
          <h2>Analytical event timeline</h2>
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                <button type="button" onClick={() => setSelectedEvent(event)}>
                  <span className="swatch" style={{ background: eventColor(event.eventType) }} />
                  {event.startedAt.slice(11, 16)} — {event.displayTitle ?? event.publicLabel ?? eventTypeLabel(event.eventType)}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <EventDetails event={selectedEvent} />
      </aside>
      <main className="map-shell">
        <MapContainer center={[32.6, 38.0]} zoom={5} scrollWheelZoom className="map">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          {regions.map((region) => (
            <Polygon key={region.id} positions={(region.geometry.coordinates[0] ?? []).map(([lon, lat]) => [lat, lon])} pathOptions={{ color: '#334155', weight: 1, dashArray: '4 6', fillOpacity: 0.02 }} />
          ))}
          {restrictions.map((restriction) => restriction.geometry.type === 'Polygon' ? (
            <Polygon key={restriction.id} positions={(restriction.geometry.coordinates[0] ?? []).map(([lon, lat]) => [lat, lon])} pathOptions={{ color: '#8b5cf6', fillOpacity: 0.1 }} />
          ) : (
            <CircleMarker key={restriction.id} center={[restriction.geometry.coordinates[1], restriction.geometry.coordinates[0]]} radius={8} pathOptions={{ color: '#8b5cf6' }} />
          ))}
          {filteredTracks.map((track) => (
            <Polyline key={track.id} positions={track.points.map((point) => [point.latitude, point.longitude])} pathOptions={{ color: '#0f766e', weight: 3, opacity: 0.7 }} />
          ))}
          {densityOverlay.map((item, index) => (
            <Circle key={`${item.lat}-${item.lon}-${index}`} center={[item.lat, item.lon]} radius={item.count * 12000} pathOptions={{ color: '#22c55e', fillOpacity: 0.08, weight: 1 }} />
          ))}
          {events.map((event) => event.geometry.type === 'Point' ? (
            <CircleMarker
              key={event.id}
              center={[event.geometry.coordinates[1], event.geometry.coordinates[0]]}
              radius={6 + event.confidence * 10}
              pathOptions={{ color: eventColor(event.eventType), fillOpacity: 0.75 }}
              eventHandlers={{ click: () => setSelectedEvent(event) }}
            />
          ) : (
            <Polygon
              key={event.id}
              positions={(event.geometry.coordinates[0] ?? []).map(([lon, lat]) => [lat, lon])}
              pathOptions={{ color: eventColor(event.eventType), fillOpacity: 0.2 }}
              eventHandlers={{ click: () => setSelectedEvent(event) }}
            />
          ))}
        </MapContainer>
      </main>
    </div>
  );
}

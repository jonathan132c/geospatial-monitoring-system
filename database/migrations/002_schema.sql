CREATE TABLE IF NOT EXISTS providers (
  provider_key TEXT PRIMARY KEY,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('track', 'conflict', 'restriction')),
  display_name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('built_in', 'custom')),
  geom geometry(Polygon, 4326) NOT NULL,
  bbox geometry(Polygon, 4326) NOT NULL,
  geojson JSONB NOT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_regions_geom ON regions USING GIST (geom);

CREATE TABLE IF NOT EXISTS raw_source_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_key TEXT NOT NULL UNIQUE,
  provider_key TEXT NOT NULL REFERENCES providers(provider_key),
  source_type TEXT NOT NULL CHECK (source_type IN ('track', 'conflict_indicator', 'restriction', 'bulletin')),
  received_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_payload_provider_time ON raw_source_payloads(provider_key, received_at DESC);

CREATE TABLE IF NOT EXISTS track_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_key TEXT NOT NULL UNIQUE,
  raw_payload_id UUID NOT NULL REFERENCES raw_source_payloads(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES providers(provider_key),
  observed_at TIMESTAMPTZ NOT NULL,
  icao24 TEXT NOT NULL,
  callsign TEXT,
  geom geometry(Point, 4326) NOT NULL,
  altitude_ft INTEGER,
  heading NUMERIC(6,2),
  speed_kts NUMERIC(6,2),
  origin TEXT,
  destination TEXT,
  squawk TEXT,
  aircraft_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_track_obs_icao_time ON track_observations(icao24, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_obs_geom ON track_observations USING GIST (geom);

CREATE TABLE IF NOT EXISTS flight_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_key TEXT NOT NULL UNIQUE,
  icao24 TEXT NOT NULL,
  callsign TEXT,
  squawk TEXT,
  origin TEXT,
  destination TEXT,
  aircraft_type TEXT,
  providers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  route_line geometry(LineString, 4326) NOT NULL,
  region_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flight_tracks_route_line ON flight_tracks USING GIST (route_line);
CREATE INDEX IF NOT EXISTS idx_flight_tracks_time ON flight_tracks(start_time, end_time);

CREATE TABLE IF NOT EXISTS track_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_track_id UUID NOT NULL REFERENCES flight_tracks(id) ON DELETE CASCADE,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('route_deviation', 'abrupt_altitude_change', 'holding_pattern', 'transponder_loss', 'corridor_shift', 'airspace_exit_reentry')),
  observed_at TIMESTAMPTZ NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  explanation TEXT NOT NULL,
  geom geometry(Point, 4326),
  related_region_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_track_anomalies_geom ON track_anomalies USING GIST (geom);

CREATE TABLE IF NOT EXISTS conflict_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_key TEXT NOT NULL UNIQUE,
  raw_payload_id UUID NOT NULL REFERENCES raw_source_payloads(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES providers(provider_key),
  indicator_type TEXT NOT NULL CHECK (indicator_type IN ('notam_restriction', 'icao_bulletin', 'easa_bulletin', 'thermal_anomaly', 'osint_report', 'news_report')),
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  geom geometry(Geometry, 4326) NOT NULL,
  region_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  headline TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'advisory', 'warning', 'critical')),
  independent_source_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conflict_indicators_geom ON conflict_indicators USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_conflict_indicators_time ON conflict_indicators(observed_at DESC);

CREATE TABLE IF NOT EXISTS airspace_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restriction_key TEXT NOT NULL UNIQUE,
  raw_payload_id UUID NOT NULL REFERENCES raw_source_payloads(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL REFERENCES providers(provider_key),
  title TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  geom geometry(Geometry, 4326) NOT NULL,
  region_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  restriction_level TEXT NOT NULL CHECK (restriction_level IN ('advisory', 'closure', 'avoidance')),
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_airspace_restrictions_geom ON airspace_restrictions USING GIST (geom);

CREATE TABLE IF NOT EXISTS inferred_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('confirmed_strike', 'probable_strike', 'airspace_closure', 'aircraft_diversion_cluster', 'thermal_anomaly', 'unverified_report')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  geom geometry(Geometry, 4326) NOT NULL,
  region_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_providers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasoning JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inferred_events_geom ON inferred_events USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_inferred_events_time ON inferred_events(started_at DESC);

CREATE TABLE IF NOT EXISTS event_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES inferred_events(id) ON DELETE CASCADE,
  source_payload_id UUID REFERENCES raw_source_payloads(id),
  provider_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_evidence_event ON event_evidence(event_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_hours INTEGER NOT NULL CHECK (window_hours IN (6, 24, 72)),
  summary JSONB NOT NULL
);

CREATE OR REPLACE VIEW active_event_windows AS
SELECT
  event_key,
  event_type,
  started_at,
  ended_at,
  confidence,
  title,
  summary,
  region_keys
FROM inferred_events
WHERE ended_at >= NOW() - INTERVAL '72 hours';

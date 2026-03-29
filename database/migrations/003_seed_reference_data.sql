INSERT INTO providers (provider_key, provider_kind, display_name) VALUES
  ('opensky', 'track', 'OpenSky (adapter)'),
  ('adsb_exchange', 'track', 'ADS-B Exchange (adapter)'),
  ('flightaware', 'track', 'FlightAware-compatible adapter'),
  ('notam_feed', 'restriction', 'NOTAM / airspace restrictions'),
  ('icao_bulletins', 'conflict', 'ICAO conflict bulletins'),
  ('easa_bulletins', 'conflict', 'EASA conflict bulletins'),
  ('nasa_firms', 'conflict', 'NASA FIRMS thermal anomalies'),
  ('osint_news', 'conflict', 'Vetted OSINT / news adapters')
ON CONFLICT (provider_key) DO NOTHING;

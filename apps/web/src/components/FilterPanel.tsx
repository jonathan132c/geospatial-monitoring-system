import type { ChangeEvent } from 'react';

export interface Filters {
  region: string;
  windowHours: 6 | 24 | 72;
  minConfidence: number;
  minAltitude?: number;
  maxAltitude?: number;
  sourceType: string;
  aircraftType: string;
}

interface FilterPanelProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  aircraftTypes: string[];
}

export const FilterPanel = ({ filters, onChange, aircraftTypes }: FilterPanelProps) => {
  const update = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    onChange({
      ...filters,
      [name]: name === 'windowHours' || name === 'minConfidence' || name === 'minAltitude' || name === 'maxAltitude'
        ? (value === '' ? undefined : Number(value))
        : value
    } as Filters);
  };

  return (
    <section className="panel filters">
      <h2>Filters</h2>
      <label>
        Region
        <select name="region" value={filters.region} onChange={update}>
          <option value="">All</option>
          <option value="iran">Iran</option>
          <option value="israel">Israel</option>
          <option value="arabian-peninsula">Arabian Peninsula</option>
          <option value="eastern-mediterranean">Eastern Mediterranean</option>
        </select>
      </label>
      <label>
        Time window
        <select name="windowHours" value={filters.windowHours} onChange={update}>
          <option value={6}>6h</option>
          <option value={24}>24h</option>
          <option value={72}>72h</option>
        </select>
      </label>
      <label>
        Min confidence
        <input name="minConfidence" type="range" min={0} max={1} step={0.05} value={filters.minConfidence} onChange={update} />
        <span>{filters.minConfidence.toFixed(2)}</span>
      </label>
      <label>
        Min altitude (ft)
        <input name="minAltitude" type="number" value={filters.minAltitude ?? ''} onChange={update} placeholder="0" />
      </label>
      <label>
        Max altitude (ft)
        <input name="maxAltitude" type="number" value={filters.maxAltitude ?? ''} onChange={update} placeholder="45000" />
      </label>
      <label>
        Source type
        <select name="sourceType" value={filters.sourceType} onChange={update}>
          <option value="">All</option>
          <option value="opensky">OpenSky</option>
          <option value="adsb_exchange">ADS-B Exchange</option>
          <option value="flightaware">FlightAware-compatible</option>
          <option value="osint_news">OSINT / news</option>
          <option value="nasa_firms">NASA FIRMS</option>
          <option value="notam_feed">NOTAM</option>
        </select>
      </label>
      <label>
        Aircraft type
        <select name="aircraftType" value={filters.aircraftType} onChange={update}>
          <option value="">All</option>
          {aircraftTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </label>
    </section>
  );
};

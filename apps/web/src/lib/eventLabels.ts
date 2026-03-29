export const eventTypeLabel = (eventType: string): string => {
  switch (eventType) {
    case 'confirmed_strike': return 'Historically corroborated public-source event candidate';
    case 'probable_strike': return 'Probabilistic public-source event candidate';
    case 'airspace_closure': return 'Public airspace restriction';
    case 'aircraft_diversion_cluster': return 'Aircraft diversion cluster';
    case 'thermal_anomaly': return 'Thermal anomaly cluster';
    case 'unverified_report': return 'Unverified public-source report';
    default: return eventType;
  }
};

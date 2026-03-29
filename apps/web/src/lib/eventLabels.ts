export const eventTypeLabel = (eventType: string): string => {
  switch (eventType) {
    case 'possible_strike': return 'Possible strike candidate';
    case 'airspace_restriction_notice': return 'Airspace restriction notice';
    case 'traffic_disruption_cluster': return 'Traffic disruption cluster';
    case 'thermal_cluster': return 'Thermal cluster';
    case 'unverified_report': return 'Unverified report';
    default: return eventType;
  }
};

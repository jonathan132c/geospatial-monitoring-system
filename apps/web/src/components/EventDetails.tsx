import { eventTypeLabel } from '../lib/eventLabels';

interface EventDetailsProps {
  event: any | null;
}

export const EventDetails = ({ event }: EventDetailsProps) => {
  if (!event) {
    return (
      <section className="panel event-details">
        <h2>Analytical event evidence</h2>
        <p>Select an event marker to inspect evidence, confidence reasoning, and summarized audit references.</p>
      </section>
    );
  }

  return (
    <section className="panel event-details">
      <h2>{event.displayTitle ?? event.publicLabel ?? eventTypeLabel(event.eventType)}</h2>
      <p>{event.summary}</p>
      <p><strong>Safety note:</strong> {event.safetyNotice ?? 'Non-operational public-source analytical output only.'}</p>
      <ul>
        <li><strong>Type:</strong> {event.publicLabel ?? eventTypeLabel(event.eventType)}</li>
        <li><strong>Confidence:</strong> {event.confidence}</li>
        <li><strong>Window:</strong> {event.startedAt} → {event.endedAt}</li>
      </ul>
      <h3>Reasoning</h3>
      <ul>
        {event.reasoning.signals.map((signal: any) => (
          <li key={`${signal.label}-${signal.weight}`}>
            {signal.effect === 'increase' ? '+' : '-'}{signal.weight.toFixed(2)} {signal.label}: {signal.evidence}
          </li>
        ))}
      </ul>
      <h3>Evidence</h3>
      <ul>
        {event.evidence.map((evidence: any) => (
          <li key={`${evidence.sourcePayloadId}-${evidence.provider}`}>
            {evidence.observedAt} — {evidence.provider}: {evidence.summary}
          </li>
        ))}
      </ul>
    </section>
  );
};

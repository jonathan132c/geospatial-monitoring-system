import { describe, expect, it } from 'vitest';
import { buildMonitoringSnapshot } from '../../packages/core/src';

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe('correlation rules', () => {
  it('produces confirmed, probable, and unverified event classes from heterogeneous evidence', async () => {
    const snapshot = await buildMonitoringSnapshot({ logger, sourceMode: 'demo' });
    const eventTypes = snapshot.events.map((event) => event.eventType);

    expect(eventTypes).toContain('confirmed_strike');
    expect(eventTypes).toContain('probable_strike');
    expect(eventTypes).toContain('unverified_report');
    expect(snapshot.events.find((event) => event.eventType === 'confirmed_strike')?.reasoning.signals.length).toBeGreaterThan(2);
  });
});

import { describe, expect, it } from 'vitest';
import { bboxToPolygon, pointInBoundingBox, pointInPolygon, validateBoundingBox, validatePolygon } from '../../packages/core/src';

describe('geometry filtering', () => {
  it('validates and matches polygon + bbox membership', () => {
    const bbox = { minLon: 34.2, minLat: 29.4, maxLon: 35.9, maxLat: 33.5 };
    validateBoundingBox(bbox);
    const polygon = bboxToPolygon(bbox);
    validatePolygon(polygon);

    const inside = { type: 'Point' as const, coordinates: [34.8, 32.0] as [number, number] };
    const outside = { type: 'Point' as const, coordinates: [40.0, 10.0] as [number, number] };

    expect(pointInBoundingBox(inside, bbox)).toBe(true);
    expect(pointInPolygon(inside, polygon)).toBe(true);
    expect(pointInBoundingBox(outside, bbox)).toBe(false);
    expect(pointInPolygon(outside, polygon)).toBe(false);
  });
});

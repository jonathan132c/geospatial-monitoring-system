import { z } from 'zod';
import type { BoundingBox } from '../../../../packages/core/src';

const numeric = z.preprocess((value) => (value === undefined || value === '' ? undefined : Number(value)), z.number().finite().optional());

export const querySchema = z.object({
  region: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  minConfidence: numeric,
  minAltitude: numeric,
  maxAltitude: numeric,
  sourceType: z.string().optional(),
  bbox: z.string().optional()
});

export const parseBBox = (value?: string): BoundingBox | undefined => {
  if (!value) return undefined;
  const parts = value.split(',').map((item) => Number(item.trim()));
  if (parts.length !== 4 || parts.some((item) => Number.isNaN(item))) {
    throw new Error('bbox must be minLon,minLat,maxLon,maxLat');
  }
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
  return { minLon, minLat, maxLon, maxLat };
};

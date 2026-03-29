import type { WindowHours } from '../types/domain';

export const toUtcIso = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.toISOString();
};

export const addHours = (iso: string, hours: number): string => {
  const date = new Date(iso);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
};

export const subtractHours = (iso: string, hours: number): string => addHours(iso, -hours);

export const getWindowStart = (now: string, windowHours: WindowHours): string => subtractHours(now, windowHours);

export const isWithinRange = (valueIso: string, startIso?: string, endIso?: string): boolean => {
  const value = new Date(valueIso).getTime();
  if (startIso && value < new Date(startIso).getTime()) return false;
  if (endIso && value > new Date(endIso).getTime()) return false;
  return true;
};

export const minuteBucket = (valueIso: string, bucketMinutes: number): string => {
  const date = new Date(valueIso);
  const minutes = date.getUTCMinutes();
  const rounded = Math.floor(minutes / bucketMinutes) * bucketMinutes;
  date.setUTCMinutes(rounded, 0, 0);
  return date.toISOString();
};

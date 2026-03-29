import type { BoundingBox, PointGeometry, PolygonGeometry, RegionDefinition, SupportedGeometry } from '../types/domain';

export const validateBoundingBox = (bbox: BoundingBox): void => {
  if (bbox.minLon >= bbox.maxLon || bbox.minLat >= bbox.maxLat) {
    throw new Error('Invalid bounding box ordering');
  }
  if (Math.abs(bbox.minLon) > 180 || Math.abs(bbox.maxLon) > 180 || Math.abs(bbox.minLat) > 90 || Math.abs(bbox.maxLat) > 90) {
    throw new Error('Bounding box exceeds geographic limits');
  }
};

export const validatePolygon = (polygon: PolygonGeometry): void => {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) {
    throw new Error('Polygon requires at least 4 coordinates in the first ring');
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    throw new Error('Polygon ring must be closed');
  }
  for (const [lon, lat] of ring) {
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      throw new Error('Polygon coordinate exceeds geographic limits');
    }
  }
};

export const pointInBoundingBox = (point: PointGeometry, bbox: BoundingBox): boolean => {
  const [lon, lat] = point.coordinates;
  return lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat;
};

export const pointInPolygon = (point: PointGeometry, polygon: PolygonGeometry): boolean => {
  const [x, y] = point.coordinates;
  const ring = polygon.coordinates[0];
  if (!ring) return false;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;

    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
};

export const geometryIntersectsRegion = (geometry: SupportedGeometry, region: RegionDefinition): boolean => {
  validatePolygon(region.geometry);
  validateBoundingBox(region.bbox);

  if (geometry.type === 'Point') {
    return pointInBoundingBox(geometry, region.bbox) && pointInPolygon(geometry, region.geometry);
  }

  const ring = geometry.coordinates[0];
  if (!ring) return false;

  return ring.some(([lon, lat]) =>
    pointInBoundingBox({ type: 'Point', coordinates: [lon, lat] }, region.bbox) &&
    pointInPolygon({ type: 'Point', coordinates: [lon, lat] }, region.geometry)
  );
};

export const bboxToPolygon = (bbox: BoundingBox): PolygonGeometry => ({
  type: 'Polygon',
  coordinates: [[
    [bbox.minLon, bbox.minLat],
    [bbox.maxLon, bbox.minLat],
    [bbox.maxLon, bbox.maxLat],
    [bbox.minLon, bbox.maxLat],
    [bbox.minLon, bbox.minLat]
  ]]
});

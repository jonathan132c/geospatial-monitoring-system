import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { SnapshotRepository } from '../repositories/snapshot-repository';
import type { RegionDefinition } from '../../../../packages/core/src';
import { bboxToPolygon, validateBoundingBox, validatePolygon } from '../../../../packages/core/src';

const bboxSchema = z.object({
  minLon: z.number(),
  minLat: z.number(),
  maxLon: z.number(),
  maxLat: z.number()
});

const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()])))
});

const regionBodySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  bbox: bboxSchema.optional(),
  geometry: polygonSchema.optional()
}).refine((value) => Boolean(value.bbox || value.geometry), 'Provide either bbox or geometry');

export const registerRegionRoutes = (app: FastifyInstance, repository: SnapshotRepository): void => {
  app.get('/regions', async () => {
    const snapshot = await repository.getSnapshot();
    return { items: snapshot.regions };
  });

  app.post('/regions', async (request, reply) => {
    const parsed = regionBodySchema.parse(request.body);
    const geometryRing = parsed.geometry?.coordinates[0];
    const bbox = parsed.bbox ?? (() => {
      if (!geometryRing) {
        throw new Error('Geometry ring is required when bbox is omitted');
      }
      return {
        minLon: Math.min(...geometryRing.map(([lon]) => lon)),
        minLat: Math.min(...geometryRing.map(([, lat]) => lat)),
        maxLon: Math.max(...geometryRing.map(([lon]) => lon)),
        maxLat: Math.max(...geometryRing.map(([, lat]) => lat))
      };
    })();
    const geometry = parsed.geometry ?? bboxToPolygon(bbox);
    validateBoundingBox(bbox);
    validatePolygon(geometry);

    const region: RegionDefinition = {
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
      tags: parsed.tags,
      bbox,
      geometry,
      source: 'custom',
      createdAt: new Date().toISOString()
    };

    const created = await repository.addRegion(region);
    reply.code(201);
    return created;
  });
};

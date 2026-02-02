import { FastifyInstance } from 'fastify';
import { getAppConfig } from '../services/firestoreService.js';

export async function configRoutes(fastify: FastifyInstance): Promise<void> {
  // Get public app configuration (no auth required)
  fastify.get('/api/config', async () => {
    const config = await getAppConfig();
    return config;
  });
}

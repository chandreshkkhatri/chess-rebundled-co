import { FastifyInstance } from 'fastify';
import { getAppConfig } from '../services/firestoreService.js';
import { geminiAudioStatus } from '../services/geminiAudioHealth.js';

export async function configRoutes(fastify: FastifyInstance): Promise<void> {
  // Get public app configuration (no auth required)
  fastify.get('/api/config', async () => {
    const config = await getAppConfig();
    return config;
  });

  // Which speech engines the server can offer right now (no auth required).
  // Not cached: clients poll it to fall back while Gemini audio is failing.
  fastify.get('/api/speech', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { geminiAudio: geminiAudioStatus() };
  });
}

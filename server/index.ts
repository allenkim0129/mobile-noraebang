import 'dotenv/config';
import express from 'express';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { createYouTubeService } from './youtube.js';

const app = createApp(createYouTubeService({ apiKey: process.env.YOUTUBE_API_KEY?.trim() }));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (process.env.NODE_ENV === 'production') {
  const dist = resolve('dist');
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

const server = app.listen(port, host, () => {
  console.log(`norae. is ready at http://localhost:${port}`);
  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    console.warn('YouTube search is not configured. Set YOUTUBE_API_KEY in .env. Link playback is available.');
  }
});
server.on('error', (error) => {
  console.error(`Unable to start norae.: ${error.message}`);
  process.exitCode = 1;
});

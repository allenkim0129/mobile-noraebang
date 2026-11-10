import { createApp } from './app.js';
import { createYouTubeService } from './youtube.js';

export default createApp(
  createYouTubeService({ apiKey: process.env.YOUTUBE_API_KEY?.trim() }),
  { hosting: 'vercel' },
);

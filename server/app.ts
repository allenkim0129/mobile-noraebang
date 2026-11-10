import express from 'express';
import type { AppConfig } from '../src/types.js';
import { SearchError, type YouTubeService } from './youtube.js';

export function createApp(
  service: YouTubeService,
  { hosting = 'local' }: { hosting?: AppConfig['hosting'] } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  if (hosting === 'vercel') app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
    next();
  });

  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ searchConfigured: service.configured, hosting } satisfies AppConfig);
  });

  const requests = new Map<string, { count: number; resetsAt: number }>();
  app.get('/api/search', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const { q, alternatives } = req.query;
    if (typeof q !== 'string' || !q.trim() || q.trim().length > 100
      || (alternatives !== undefined && alternatives !== 'true')) {
      res.status(400).json({ code: 'INVALID_QUERY', error: '검색어를 1~100자로 입력해 주세요.' });
      return;
    }
    const now = Date.now();
    for (const [ip, entry] of requests) {
      if (entry.resetsAt <= now) requests.delete(ip);
    }
    const ip = req.ip ?? 'unknown';
    const entry = requests.get(ip) ?? { count: 0, resetsAt: now + 60_000 };
    if (entry.count >= 20) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetsAt - now) / 1000))));
      res.status(429).json({ code: 'RATE_LIMITED', error: '검색 요청이 너무 많아요. 1분 후 다시 시도해 주세요.' });
      return;
    }
    entry.count += 1;
    requests.set(ip, entry);
    try {
      res.json(await service.search(q, alternatives === 'true'));
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', error: '요청한 API를 찾을 수 없어요.' });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SearchError) {
      console.error(`[search] ${error.code}: ${error.message}`);
      res.status(error.status).json({ code: error.code, error: error.message });
      return;
    }
    console.error('[server] Unexpected request failure');
    res.status(500).json({ code: 'INTERNAL_ERROR', error: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
  });
  return app;
}

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test, type TestContext } from 'node:test';
import type { Express } from 'express';
import { createApp } from './app.js';
import type { YouTubeService } from './youtube.js';

async function serve(t: TestContext, app: Express) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

test('Vercel function exports handle full API paths and keep runtime credentials server-side', async (t) => {
  const originalKey = process.env.YOUTUBE_API_KEY;
  const originalFetch = globalThis.fetch;
  const upstreamRequests: URL[] = [];
  const tjId = 'UCZUhx8ClCv6paFW7qi3qljg';
  const kyId = `UC${'k'.repeat(22)}`;
  process.env.YOUTUBE_API_KEY = 'test-only-vercel-secret';
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'www.googleapis.com') return originalFetch(input, init);
    upstreamRequests.push(url);
    assert.equal(url.searchParams.get('key'), 'test-only-vercel-secret');
    if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ id: kyId }] });
    const channelId = url.searchParams.get('channelId');
    return Response.json({ items: [{
      id: { videoId: channelId === tjId ? 'abcdefghijk' : 'lmnopqrstuv' },
      snippet: { title: '테스트 반주', channelId, channelTitle: '테스트 채널' },
    }] });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalKey;
  });

  const { default: configHandler } = await import('../api/config.js');
  const { default: searchHandler } = await import('../api/search.js');
  assert.equal(configHandler, searchHandler);
  const base = await serve(t, configHandler);

  const config = await fetch(`${base}/api/config`);
  assert.equal(config.status, 200);
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await config.json(), { searchConfigured: true, hosting: 'vercel' });

  const search = await fetch(`${base}/api/search?q=${encodeURIComponent('아이유')}`, {
    headers: { 'x-forwarded-for': '192.0.2.1' },
  });
  assert.equal(search.status, 200);
  const body = await search.text();
  assert.ok(!body.includes('test-only-vercel-secret'));
  const result = JSON.parse(body);
  assert.deepEqual(result.official.map((song: { provider: string }) => song.provider), ['tj', 'ky']);
  assert.equal(upstreamRequests.length, 3);
  assert.equal((await fetch(`${base}/api/search?q=`)).status, 400);
});

test('Vercel rate limits use platform-forwarded client IPs, not one shared function socket', async (t) => {
  const service: YouTubeService = {
    configured: true,
    search: async () => ({ official: [], alternatives: [], alternativesLoaded: true }),
  };
  const base = await serve(t, createApp(service, { hosting: 'vercel' }));
  for (let i = 0; i < 20; i++) {
    assert.equal((await fetch(`${base}/api/search?q=test`, {
      headers: { 'x-forwarded-for': '192.0.2.1' },
    })).status, 200);
  }
  assert.equal((await fetch(`${base}/api/search?q=test`, {
    headers: { 'x-forwarded-for': '192.0.2.1' },
  })).status, 429);
  assert.equal((await fetch(`${base}/api/search?q=test`, {
    headers: { 'x-forwarded-for': '192.0.2.2' },
  })).status, 200);
});

test('local server does not trust a caller-supplied forwarding header', async (t) => {
  const service: YouTubeService = {
    configured: true,
    search: async () => ({ official: [], alternatives: [], alternativesLoaded: true }),
  };
  const base = await serve(t, createApp(service));
  for (let i = 0; i < 20; i++) {
    assert.equal((await fetch(`${base}/api/search?q=test`, {
      headers: { 'x-forwarded-for': `192.0.2.${i + 1}` },
    })).status, 200);
  }
  assert.equal((await fetch(`${base}/api/search?q=test`, {
    headers: { 'x-forwarded-for': '192.0.2.99' },
  })).status, 429);
});

test('deployment configuration serves Vite assets without rewriting API functions into HTML', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.framework, 'vite');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.functions['api/*.ts'].maxDuration, 60);
  assert.equal(config.rewrites, undefined);
  const headers = config.headers.find((rule: { source: string }) => rule.source === '/(.*)').headers;
  assert.ok(headers.some((header: { key: string; value: string }) =>
    header.key === 'Referrer-Policy' && header.value === 'strict-origin-when-cross-origin'));
  assert.ok(headers.some((header: { key: string; value: string }) =>
    header.key === 'Permissions-Policy' && header.value === 'camera=(), microphone=()'));
  const ignored = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.ok(ignored.split('\n').includes('.env'));
  assert.ok(ignored.split('\n').includes('.env.*'));
});

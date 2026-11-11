import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from './app.js';
import { createYouTubeService } from './youtube.js';

test('API validates input, reports missing configuration, limits requests and does not expose a key', async (t) => {
  const server = createApp(createYouTubeService({})).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;

  const config = await fetch(`${base}/api/config`);
  assert.deepEqual(await config.json(), { searchConfigured: false, hosting: 'local' });
  assert.equal(config.headers.get('permissions-policy'), 'camera=(), microphone=()');
  assert.equal(config.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(config.headers.get('x-powered-by'), null);
  assert.equal((await fetch(`${base}/api/search?q=`)).status, 400);
  assert.equal((await fetch(`${base}/api/search?q=test&alternatives=wrong`)).status, 400);
  assert.equal((await fetch(`${base}/api/search?q=test&q=other`)).status, 400);
  for (const suffix of ['vocal=unknown', 'vocal=male&vocal=female', 'key=7', 'key=-7', 'key=1.5', 'key=', 'key=NaN', 'key=0&key=2']) {
    const invalid = await fetch(`${base}/api/search?q=test&${suffix}`);
    assert.equal(invalid.status, 400, suffix);
    assert.equal((await invalid.json()).code, 'INVALID_PREFERENCES');
  }

  const search = await fetch(`${base}/api/search?q=test`);
  assert.equal(search.status, 503);
  assert.equal((await search.json()).code, 'NOT_CONFIGURED');

  for (let i = 1; i < 20; i++) await fetch(`${base}/api/search?q=test`);
  const limited = await fetch(`${base}/api/search?q=test`);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
});

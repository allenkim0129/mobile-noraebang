import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createYouTubeService, SearchError } from './youtube.js';

const tjId = 'UCZUhx8ClCv6paFW7qi3qljg';
const kyId = `UC${'k'.repeat(22)}`;
const otherId = `UC${'o'.repeat(22)}`;

function video(id: string, channelId = tjId) {
  return {
    id: { videoId: id },
    snippet: { title: `노래 ${id}`, channelId, channelTitle: '채널' },
  };
}

function fixture(handler?: (url: URL) => Response | Promise<Response>) {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (handler) return handler(url);
    if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ id: kyId }] });
    const channel = url.searchParams.get('channelId');
    return Response.json({
      items: channel === tjId ? [video('abcdefghijk')]
        : channel === kyId ? [video('lmnopqrstuv', kyId)] : [video('12345678901', otherId)],
    });
  };
  return { calls, fetcher };
}

function rejectsCode(code: string) {
  return (error: unknown) => error instanceof SearchError && error.code === code;
}

test('missing API key gives an actionable error without making upstream requests', async () => {
  const { calls, fetcher } = fixture();
  const service = createYouTubeService({ fetcher });
  assert.equal(service.configured, false);
  await assert.rejects(service.search('아이유'), rejectsCode('NOT_CONFIGURED'));
  assert.equal(calls.length, 0);
});

test('validates queries before spending quota', async () => {
  const { calls, fetcher } = fixture();
  const service = createYouTubeService({ apiKey: 'test-key', fetcher });
  await assert.rejects(service.search('  '), rejectsCode('INVALID_QUERY'));
  await assert.rejects(service.search('a'.repeat(101)), rejectsCode('INVALID_QUERY'));
  assert.equal(calls.length, 0);
});

test('searches verified official channel IDs first with embeddable-video restrictions', async () => {
  const { calls, fetcher } = fixture();
  const result = await createYouTubeService({ apiKey: 'test-key', fetcher }).search(' 아이유   밤편지 ');
  assert.deepEqual(result.official.map((song) => song.provider), ['tj', 'ky']);
  assert.deepEqual(result.alternatives, []);
  assert.equal(result.alternativesLoaded, false);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].searchParams.get('forHandle'), '@karaokeky');
  for (const url of calls.slice(1)) {
    assert.equal(url.hostname, 'www.googleapis.com');
    assert.equal(url.searchParams.get('q'), '아이유 밤편지');
    assert.equal(url.searchParams.get('type'), 'video');
    assert.equal(url.searchParams.get('videoEmbeddable'), 'true');
    assert.equal(url.searchParams.get('videoSyndicated'), 'true');
  }
});

test('reuses official search cache when explicitly loading other MR candidates', async () => {
  const { calls, fetcher } = fixture();
  const service = createYouTubeService({ apiKey: 'test-key', fetcher });
  await service.search('아이유');
  const result = await service.search('아이유', true);
  assert.equal(calls.length, 4);
  assert.equal(result.alternativesLoaded, true);
  assert.equal(result.alternatives[0].provider, 'other');
  assert.equal(calls.at(-1)?.searchParams.get('q'), '아이유 노래방 MR');
  await service.search('아이유', true);
  assert.equal(calls.length, 4);
});

test('automatically searches other channels when official results are empty', async () => {
  const { calls, fetcher } = fixture((url) => {
    if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ id: kyId }] });
    return Response.json({ items: url.searchParams.has('channelId') ? [] : [
      video('12345678901', otherId), video('12345678901', otherId), video('abcdefghijk', tjId),
    ] });
  });
  const result = await createYouTubeService({ apiKey: 'test-key', fetcher }).search('없는곡');
  assert.deepEqual(result.official, []);
  assert.equal(result.alternativesLoaded, true);
  assert.deepEqual(result.alternatives.map((song) => song.id), ['12345678901']);
  assert.equal(calls.length, 4);
});

test('does not trust a channel display name as proof of official ownership', async () => {
  const { fetcher } = fixture((url) => {
    if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ id: kyId }] });
    return Response.json({ items: url.searchParams.has('channelId') ? [] : [{
      ...video('12345678901', otherId),
      snippet: { title: '[TJ노래방] Fake', channelId: otherId, channelTitle: 'TJ 공식 채널' },
    }] });
  });
  const result = await createYouTubeService({ apiKey: 'test-key', fetcher }).search('곡');
  assert.equal(result.alternatives[0].provider, 'other');
});

test('rejects malformed video metadata and unexpected channels in an official search', async () => {
  for (const item of [
    { id: { videoId: 'short' }, snippet: { title: '곡', channelId: tjId, channelTitle: 'TJ' } },
    { id: { videoId: 'abcdefghijk' }, snippet: { title: 42, channelId: tjId, channelTitle: 'TJ' } },
    video('abcdefghijk', otherId),
  ]) {
    const { fetcher } = fixture((url) => {
      if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ id: kyId }] });
      return Response.json({ items: url.searchParams.get('channelId') === tjId ? [item] : [] });
    });
    await assert.rejects(createYouTubeService({ apiKey: 'test-key', fetcher }).search('곡'), rejectsCode('INVALID_RESPONSE'));
  }
});

test('coalesces simultaneous identical requests and expires search metadata after five minutes', async () => {
  let time = 0;
  const { calls, fetcher } = fixture();
  const service = createYouTubeService({ apiKey: 'test-key', fetcher, now: () => time });
  const [first, second] = await Promise.all([service.search('Song'), service.search('song')]);
  assert.deepEqual(first, second);
  assert.equal(calls.length, 3);
  time = 5 * 60 * 1000 + 1;
  await service.search('song');
  assert.equal(calls.length, 5);
});

test('surfaces quota errors instead of showing an empty success result', async () => {
  const { fetcher } = fixture(() => Response.json({
    error: { errors: [{ reason: 'quotaExceeded' }] },
  }, { status: 403 }));
  await assert.rejects(createYouTubeService({ apiKey: 'test-key', fetcher }).search('노래'), rejectsCode('QUOTA_EXCEEDED'));
});

test('surfaces network failures and never returns credentials in the error', async () => {
  const fetcher: typeof fetch = async () => { throw new Error('test-secret-key'); };
  await assert.rejects(createYouTubeService({ apiKey: 'test-secret-key', fetcher }).search('노래'), (error: unknown) => {
    assert.ok(error instanceof SearchError);
    assert.equal(error.code, 'UPSTREAM_UNAVAILABLE');
    assert.ok(!error.message.includes('test-secret-key'));
    return true;
  });
});

test('surfaces API configuration, malformed response and official channel resolution failures', async () => {
  for (const [response, code] of [
    [Response.json({ error: {} }, { status: 403 }), 'API_CONFIGURATION'],
    [new Response('not json'), 'INVALID_RESPONSE'],
    [Response.json({ unexpected: true }), 'INVALID_RESPONSE'],
    [Response.json({ items: [] }), 'CHANNEL_UNAVAILABLE'],
  ] as const) {
    const fetcher: typeof fetch = async () => response;
    await assert.rejects(createYouTubeService({ apiKey: 'test-key', fetcher }).search('노래'), rejectsCode(code));
  }
});

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
  await assert.rejects(service.search('아이유'), (error: unknown) => {
    assert.ok(error instanceof SearchError);
    assert.equal(error.code, 'NOT_CONFIGURED');
    assert.equal(error.message, '노래 검색을 사용하려면 서버에 YouTube API 키를 설정해 주세요.');
    return true;
  });
  assert.equal(calls.length, 0);
});

test('validates queries before spending quota', async () => {
  const { calls, fetcher } = fixture();
  const service = createYouTubeService({ apiKey: 'test-key', fetcher });
  await assert.rejects(service.search('  '), rejectsCode('INVALID_QUERY'));
  await assert.rejects(service.search('a'.repeat(101)), rejectsCode('INVALID_QUERY'));
  assert.equal(calls.length, 0);
});

test('prioritizes title-matched versions across channels, then KY and TJ, with isolated caches', async () => {
  const track = (id: string, title: string, channelId: string) => {
    const item = video(id, channelId);
    return { ...item, snippet: { ...item.snippet, title } };
  };
  const kyMatch = track('lmnopqrstuv', '사랑 남자키 +2키', kyId);
  const { calls, fetcher } = fixture((url) => {
    if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ id: kyId }] });
    const channel = url.searchParams.get('channelId');
    return Response.json({ items: channel === kyId
      ? [track('abcdefghijk', '사랑 원키', kyId), kyMatch]
      : channel === tjId ? [track('12345678901', '사랑 남자키 key +2', tjId)]
        : [track('23456789012', '사랑 남자키 2키 올림', otherId), kyMatch, track('34567890123', '사랑 여자키 +2키', otherId)] });
  });
  const service = createYouTubeService({ apiKey: 'test-key', fetcher });
  const result = await service.search('사랑', false, { vocal: 'male', keyOffset: 2 });
  assert.deepEqual(result.preferred?.map((song) => song.id), ['lmnopqrstuv', '12345678901', '23456789012']);
  assert.deepEqual(result.official.map((song) => song.id), ['abcdefghijk']);
  assert.deepEqual(result.alternatives, []);
  assert.equal(result.alternativesLoaded, true);
  assert.equal(calls.length, 7);
  const searchQueries = calls.filter((url) => url.pathname.endsWith('/search')).map((url) => url.searchParams.get('q'));
  assert.equal(searchQueries.filter((query) => query?.startsWith('사랑 남자키 +2키')).length, 3);
  assert.ok(searchQueries.includes('사랑'));
  assert.ok(searchQueries.includes('사랑 노래방 MR'));
  assert.equal(await service.search('사랑', true, { vocal: 'male', keyOffset: 2 }), result);
  assert.equal(calls.length, 7);
  await service.search('사랑', false, { vocal: 'female', keyOffset: 2 });
  assert.equal(calls.length, 10);
  const ordinary = await service.search('사랑');
  assert.equal(ordinary.preferred, undefined);
  assert.equal(calls.length, 12);
});

test('retains original and nonmatching offsets from broad searches and removes opposite versions everywhere', async () => {
  const { fetcher } = fixture((url) => {
    if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ id: kyId }] });
    const channelId = url.searchParams.get('channelId') ?? otherId;
    const targeted = url.searchParams.get('q')?.includes('남자키');
    const titles = targeted ? ['남자키 +2키', '여자키 +2키'] : ['원곡', '-2키', '여자키'];
    const group = channelId === kyId ? 'k' : channelId === tjId ? 't' : 'o';
    return Response.json({ items: titles.map((title, index) => {
      const item = video(`${group}${targeted ? 'v' : 'b'}${index}abcdefgh`, channelId);
      return { ...item, snippet: { ...item.snippet, title: `노래 ${title}` } };
    }) });
  });
  const service = createYouTubeService({ apiKey: 'test-key', fetcher });
  const shifted = await service.search('노래', false, { vocal: 'male', keyOffset: 2 });
  assert.deepEqual(shifted.preferred?.map((song) => song.provider), ['ky', 'tj', 'other']);
  assert.equal(shifted.official.length, 4);
  assert.equal(shifted.alternatives.length, 2);
  const all = [...shifted.preferred ?? [], ...shifted.official, ...shifted.alternatives];
  assert.ok(all.some((song) => song.title === '노래 원곡'));
  assert.ok(all.some((song) => song.title === '노래 -2키'));
  assert.ok(all.every((song) => !song.title.includes('여자키')));
  const unshifted = await service.search('노래', false, { vocal: 'male', keyOffset: 0 });
  assert.ok(unshifted.preferred?.some((song) => song.title === '노래 원곡'));
});

test('leaves unmarked versions unverified and rejects invalid search offsets before upstream requests', async () => {
  const { calls, fetcher } = fixture();
  const service = createYouTubeService({ apiKey: 'test-key', fetcher });
  for (const keyOffset of [-7, 7, 1.5, NaN]) {
    await assert.rejects(service.search('노래', false, { vocal: 'male', keyOffset }), rejectsCode('INVALID_PREFERENCES'));
  }
  assert.equal(calls.length, 0);
  const result = await service.search('노래', false, { vocal: 'duet', keyOffset: -1 });
  assert.deepEqual(result.preferred, []);
  assert.equal(result.official.length, 2);
  assert.equal(result.alternatives.length, 1);
});

test('shows KY before TJ with verified official IDs and embeddable-video restrictions', async () => {
  const { calls, fetcher } = fixture();
  const result = await createYouTubeService({ apiKey: 'test-key', fetcher }).search(' 아이유   밤편지 ');
  assert.deepEqual(result.official.map((song) => song.provider), ['ky', 'tj']);
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
  assert.deepEqual(result.official.map((song) => song.provider), ['ky', 'tj']);
  assert.equal(result.alternatives[0].provider, 'other');
  assert.equal(calls.at(-1)?.searchParams.get('q'), '아이유 노래방 MR');
  await service.search('아이유', true);
  assert.equal(calls.length, 4);
});

test('keeps provider relevance order within KY-first groups and falls back to TJ when KY has no results', async () => {
  for (const hasKy of [true, false]) {
    const { fetcher } = fixture((url) => {
      if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ id: kyId }] });
      return Response.json({ items: url.searchParams.get('channelId') === kyId
        ? hasKy ? [video('lmnopqrstuv', kyId), video('vwxyz123456', kyId)] : []
        : [video('abcdefghijk'), video('01234567890')] });
    });
    const result = await createYouTubeService({ apiKey: 'test-key', fetcher }).search('곡');
    assert.deepEqual(result.official.map((song) => song.id), [
      ...(hasKy ? ['lmnopqrstuv', 'vwxyz123456'] : []), 'abcdefghijk', '01234567890',
    ]);
    assert.equal(result.alternativesLoaded, false);
  }
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
  await assert.rejects(createYouTubeService({ apiKey: 'test-key', fetcher }).search('노래'), (error: unknown) => {
    assert.ok(error instanceof SearchError);
    assert.equal(error.code, 'QUOTA_EXCEEDED');
    assert.equal(error.message, '오늘의 YouTube 검색 한도를 모두 사용했어요. 한도가 초기화된 후 다시 검색해 주세요.');
    return true;
  });
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

import type { Provider, SearchResults, Song } from '../src/types.js';

export class SearchError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface YouTubeResponse {
  items?: Array<{
    id?: string | { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      channelId?: string;
    };
  }>;
  error?: { errors?: Array<{ reason?: string }> };
}

const TJ_CHANNEL_ID = 'UCZUhx8ClCv6paFW7qi3qljg';
const CACHE_TTL = 5 * 60 * 1000;

export function createYouTubeService({
  apiKey,
  fetcher = fetch,
  now = Date.now,
}: {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
}) {
  const cache = new Map<string, { expiresAt: number; value: SearchResults }>();
  const pending = new Map<string, Promise<SearchResults>>();
  let kyChannel: { id: string; expiresAt: number } | undefined;

  async function request(resource: string, params: Record<string, string>) {
    if (!apiKey) {
      throw new SearchError(
        503,
        'NOT_CONFIGURED',
        '노래 검색을 사용하려면 서버에 YouTube API 키를 설정해 주세요. YouTube 링크로 바로 재생은 사용할 수 있어요.',
      );
    }

    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      throw new SearchError(502, 'UPSTREAM_UNAVAILABLE', 'YouTube에 연결하지 못했어요. 잠시 후 다시 검색해 주세요.');
    }

    let data: YouTubeResponse;
    try {
      data = await response.json() as YouTubeResponse;
    } catch {
      throw new SearchError(502, 'INVALID_RESPONSE', 'YouTube 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        throw new SearchError(429, 'QUOTA_EXCEEDED', '오늘의 YouTube 검색 한도를 모두 사용했어요. YouTube 링크로 바로 재생해 주세요.');
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new SearchError(502, 'API_CONFIGURATION', 'YouTube API 키 또는 API 사용 설정을 확인해 주세요.');
      }
      throw new SearchError(502, 'UPSTREAM_ERROR', 'YouTube 검색에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
    }
    if (!Array.isArray(data.items)) {
      throw new SearchError(502, 'INVALID_RESPONSE', 'YouTube 검색 결과 형식이 올바르지 않아요.');
    }
    return data.items;
  }

  async function getKyChannel() {
    if (kyChannel && kyChannel.expiresAt > now()) return kyChannel.id;
    const items = await request('channels', { part: 'id', forHandle: '@karaokeky' });
    const id = items[0]?.id;
    if (typeof id !== 'string' || !/^UC[\w-]{22}$/.test(id)) {
      throw new SearchError(502, 'CHANNEL_UNAVAILABLE', '금영 공식 채널을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    kyChannel = { id, expiresAt: now() + 24 * 60 * 60 * 1000 };
    return id;
  }

  async function searchVideos(query: string, kyId: string, channelId?: string) {
    const items = await request('search', {
      part: 'snippet',
      type: 'video',
      q: channelId ? query : `${query} 노래방 MR`,
      maxResults: '12',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      relevanceLanguage: 'ko',
      regionCode: 'KR',
      safeSearch: 'moderate',
      ...(channelId ? { channelId } : {}),
    });

    return items.map((item): Song => {
      const id = typeof item.id === 'object' ? item.id?.videoId : undefined;
      const snippet = item.snippet;
      if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id)
        || typeof snippet?.title !== 'string' || !snippet.title
        || typeof snippet.channelId !== 'string' || !snippet.channelId
        || typeof snippet.channelTitle !== 'string' || !snippet.channelTitle
        || (channelId && snippet.channelId !== channelId)) {
        throw new SearchError(502, 'INVALID_RESPONSE', 'YouTube 영상 정보가 올바르지 않아요.');
      }
      const provider: Provider = snippet.channelId === TJ_CHANNEL_ID ? 'tj'
        : snippet.channelId === kyId ? 'ky' : 'other';
      return { id, title: snippet.title, channelTitle: snippet.channelTitle, provider };
    });
  }

  async function search(query: string, includeAlternatives = false): Promise<SearchResults> {
    const normalized = query.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length > 100) {
      throw new SearchError(400, 'INVALID_QUERY', '검색어를 1~100자로 입력해 주세요.');
    }
    const key = `${normalized.toLocaleLowerCase('ko')}|${includeAlternatives}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const work = (async () => {
      const kyId = await getKyChannel();
      const officialKey = `${normalized.toLocaleLowerCase('ko')}|false`;
      const previous = cache.get(officialKey);
      let official: Song[];
      if (previous && previous.expiresAt > now()) {
        official = previous.value.official;
      } else {
        const [ky, tj] = await Promise.all([
          searchVideos(normalized, kyId, kyId),
          searchVideos(normalized, kyId, TJ_CHANNEL_ID),
        ]);
        official = [...new Map([...ky, ...tj].map((song) => [song.id, song])).values()];
      }
      const alternativesLoaded = includeAlternatives || official.length === 0;
      const otherResults = alternativesLoaded ? await searchVideos(normalized, kyId) : [];
      const officialIds = new Set(official.map((song) => song.id));
      const alternatives = [...new Map(otherResults
        .filter((song) => song.provider === 'other' && !officialIds.has(song.id))
        .map((song) => [song.id, song])).values()];
      const value = { official, alternatives, alternativesLoaded };
      for (const [entryKey, entry] of cache) {
        if (entry.expiresAt <= now()) cache.delete(entryKey);
      }
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expiresAt: now() + CACHE_TTL });
      return value;
    })();

    pending.set(key, work);
    try {
      return await work;
    } finally {
      pending.delete(key);
    }
  }

  return { configured: Boolean(apiKey), search };
}

export type YouTubeService = ReturnType<typeof createYouTubeService>;

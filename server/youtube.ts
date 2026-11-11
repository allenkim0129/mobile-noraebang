import type { Provider, SearchPreferences, SearchResults, Song } from '../src/types.js';
import { DEFAULT_PREFERENCES, hasPreferences, isVocalPreference, matchesPreferences, versionQuery } from '../src/lib/preferences.js';

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
        '노래 검색을 사용하려면 서버에 YouTube API 키를 설정해 주세요.',
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
        throw new SearchError(429, 'QUOTA_EXCEEDED', '오늘의 YouTube 검색 한도를 모두 사용했어요. 한도가 초기화된 후 다시 검색해 주세요.');
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

  async function search(query: string, includeAlternatives = false, preferences: SearchPreferences = DEFAULT_PREFERENCES): Promise<SearchResults> {
    const normalized = query.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length > 100) {
      throw new SearchError(400, 'INVALID_QUERY', '검색어를 1~100자로 입력해 주세요.');
    }
    if (!isVocalPreference(preferences.vocal) || !Number.isInteger(preferences.keyOffset) || Math.abs(preferences.keyOffset) > 6) {
      throw new SearchError(400, 'INVALID_PREFERENCES', '검색 버전과 -6~+6 범위의 정수 키를 선택해 주세요.');
    }
    const active = hasPreferences(preferences);
    const searchTerm = versionQuery(normalized, preferences);
    const baseKey = `${normalized.toLocaleLowerCase('ko')}|${preferences.vocal}|${preferences.keyOffset}`;
    const key = `${baseKey}|${includeAlternatives || active}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const work = (async () => {
      const kyId = await getKyChannel();
      const officialKey = `${baseKey}|false`;
      const previous = cache.get(officialKey);
      const [officialResults, generalResults] = await Promise.all([
        previous && previous.expiresAt > now() ? Promise.resolve(previous.value.official)
          : Promise.all([
            searchVideos(searchTerm, kyId, kyId),
            searchVideos(searchTerm, kyId, TJ_CHANNEL_ID),
          ]).then((groups) => [...new Map(groups.flat().map((song) => [song.id, song])).values()]),
        active ? searchVideos(searchTerm, kyId) : Promise.resolve(null),
      ]);
      const alternativesLoaded = active || includeAlternatives || officialResults.length === 0;
      const otherResults = generalResults ?? (alternativesLoaded ? await searchVideos(searchTerm, kyId) : []);
      const providerOrder: Record<Provider, number> = { ky: 0, tj: 1, other: 2 };
      const candidates = [...new Map([...officialResults, ...(active ? otherResults : [])].map((song) => [song.id, song])).values()];
      const preferred = active ? candidates.filter((song) => matchesPreferences(song.title, preferences))
        .sort((a, b) => providerOrder[a.provider] - providerOrder[b.provider]) : [];
      const preferredIds = new Set(preferred.map((song) => song.id));
      const official = candidates.filter((song) => song.provider !== 'other' && !preferredIds.has(song.id))
        .sort((a, b) => providerOrder[a.provider] - providerOrder[b.provider]);
      const officialIds = new Set(officialResults.map((song) => song.id));
      const alternatives = [...new Map(otherResults
        .filter((song) => song.provider === 'other' && !officialIds.has(song.id) && !preferredIds.has(song.id))
        .map((song) => [song.id, song])).values()];
      const value: SearchResults = { official, alternatives, alternativesLoaded, ...(active ? { preferred } : {}) };
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

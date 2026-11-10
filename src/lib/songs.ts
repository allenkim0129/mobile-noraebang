import type { Song } from '../types.js';

export function decodeTitle(title: string): string {
  return title.replace(/&(?:amp|quot|apos|lt|gt|#39|#(\d+)|#x([\da-f]+));/gi, (entity, decimal: string, hex: string) => {
    if (decimal || hex) {
      const point = Number.parseInt(decimal || hex, hex ? 16 : 10);
      return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    const entities: Record<string, string> = {
      '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>',
    };
    return entities[entity.toLowerCase()] ?? entity;
  });
}

export function displayTitle(title: string) {
  return decodeTitle(title)
    .replace(/^\s*\[TJ노래방(?:\s*\/\s*MR Live)?\]\s*/i, '')
    .replace(/\s*\/\s*(?:TJ|KY)\s*KARAOKE\s*$/i, '')
    .trim();
}

export function songFromUrl(input: string): Song | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (host === 'youtu.be') {
    if (parts.length === 1) id = parts[0];
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (parts.length === 2 && ['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1];
  } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)
    && parts.length === 2 && parts[0] === 'embed') {
    id = parts[1];
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  return { id, title: '직접 추가한 YouTube 영상', channelTitle: 'YouTube 링크', provider: 'other' };
}

export function appendToQueue(queue: Song[], song: Song): Song[] {
  return queue.some((item) => item.id === song.id) ? queue : [...queue, song];
}

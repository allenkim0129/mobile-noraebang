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

export function appendToQueue(queue: Song[], song: Song): Song[] {
  return queue.some((item) => item.id === song.id) ? queue : [...queue, song];
}

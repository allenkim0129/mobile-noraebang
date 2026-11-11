import type { Provider, Song } from '../types.js';

export const providerName: Record<Provider, string> = { tj: 'TJ', ky: '금영', other: 'YouTube' };

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

export function moveInQueue(queue: Song[], id: string, direction: -1 | 1): Song[] {
  const index = queue.findIndex((song) => song.id === id);
  const target = index + direction;
  const song = queue[index];
  const adjacent = queue[target];
  if (!song || !adjacent) return queue;
  const reordered = [...queue];
  reordered[index] = adjacent;
  reordered[target] = song;
  return reordered;
}

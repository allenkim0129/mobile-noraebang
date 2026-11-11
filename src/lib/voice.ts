import { displayTitle } from './songs.js';
import type { SearchResults, Song } from '../types.js';

export interface VoiceQuery {
  query: string;
  artist?: string;
  title?: string;
}

export function parseVoiceQuery(transcript: string): VoiceQuery | null {
  const phrase = transcript.trim().replace(/[.!?。！？]+$/u, '').trim()
    .replace(/\s*(?:찾아\s*줘|검색해\s*줘|재생해\s*줘|틀어\s*줘|검색|재생)(?:요)?$/u, '').trim();
  if (!phrase || phrase.length > 100) return null;
  const parts = phrase.match(/^(.+?)(?:의|에)\s*(.+)$/u);
  if (!parts) return { query: phrase };
  const artist = parts[1].trim().replace(/^["“'‘]|["”'’]$/gu, '');
  const title = parts[2].trim().replace(/^["“'‘]|["”'’]$/gu, '');
  if (!artist || !title) return null;
  return { query: `${artist} ${title}`, artist, title };
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s\p{P}\p{S}]/gu, '');
}

export function isExactOfficialSong(song: Song, query: VoiceQuery) {
  if (song.provider === 'other' || !query.artist || !query.title) return false;
  const parts = displayTitle(song.title).split(/\s*[-–—]\s*/u);
  if (parts.length !== 2) return false;
  const [first, second] = parts.map(normalize);
  const artist = normalize(query.artist);
  const title = normalize(query.title);
  return (first === title && second === artist) || (first === artist && second === title);
}

export function voiceCandidates(results: SearchResults) {
  const priority = { ky: 0, tj: 1, other: 2 };
  return [...new Map([...(results.preferred ?? []), ...results.official, ...results.alternatives]
    .map((song) => [song.id, song])).values()]
    .sort((a, b) => priority[a.provider] - priority[b.provider]);
}

export function automaticVoiceSong(candidates: Song[], query: VoiceQuery) {
  return candidates.find((song) => isExactOfficialSong(song, query));
}

export type VoiceChoice = { type: 'select'; index: number } | { type: 'cancel' | 'search' | 'next' | 'unknown' };

export function parseVoiceChoice(transcript: string): VoiceChoice {
  const phrase = normalize(transcript);
  if (/^(취소|그만|중지|아니요|아니|취소해줘)$/.test(phrase)) return { type: 'cancel' };
  if (/^(다시검색|새로검색|다른곡|다시찾아줘)$/.test(phrase)) return { type: 'search' };
  if (/^(다른후보|다음후보|다른영상)$/.test(phrase)) return { type: 'next' };
  const match = phrase.match(/^(1|2|3|첫|첫째|두|둘째|세|셋째)(?:번째|번)?(?:곡|영상)?(?:으로|로)?(?:재생해줘|재생|틀어줘)?$/);
  if (!match) return { type: 'unknown' };
  const indices: Record<string, number> = { '1': 0, 첫: 0, 첫째: 0, '2': 1, 두: 1, 둘째: 1, '3': 2, 세: 2, 셋째: 2 };
  return { type: 'select', index: indices[match[1]] };
}

export function parseVoiceConfirmation(transcript: string): 'play' | 'cancel' | 'search' | 'unknown' {
  const phrase = normalize(transcript);
  if (/^(응|네|예|좋아|좋아요|재생|재생해|재생해줘|재생해주세요|틀어|틀어줘|틀어주세요|시작|시작해)$/.test(phrase)) return 'play';
  const choice = parseVoiceChoice(transcript);
  return choice.type === 'cancel' || choice.type === 'search' ? choice.type : 'unknown';
}

import type { SearchPreferences, VocalPreference } from '../types.js';

export const DEFAULT_PREFERENCES: SearchPreferences = { vocal: 'any', keyOffset: 0 };
export const vocalLabels: Record<VocalPreference, string> = { any: '전체', male: '남자', female: '여자', duet: '듀엣' };

export function isVocalPreference(value: unknown): value is VocalPreference {
  return value === 'any' || value === 'male' || value === 'female' || value === 'duet';
}

export function hasPreferences(preferences: SearchPreferences) {
  return preferences.vocal !== 'any' || preferences.keyOffset !== 0;
}

export function describePreferences(preferences: SearchPreferences) {
  const key = preferences.keyOffset === 0 ? '키 지정 없음' : `${preferences.keyOffset > 0 ? '+' : ''}${preferences.keyOffset}키`;
  return `${vocalLabels[preferences.vocal]} · ${key}`;
}

export function versionQuery(query: string, preferences: SearchPreferences) {
  const vocal = { any: '', male: '남자키', female: '여자키', duet: '듀엣' }[preferences.vocal];
  const key = preferences.keyOffset === 0 ? '' : `${preferences.keyOffset > 0 ? '+' : ''}${preferences.keyOffset}키`;
  return [query, vocal, key].filter(Boolean).join(' ');
}

export function matchesPreferences(title: string, preferences: SearchPreferences) {
  const normalized = title.normalize('NFKC').replace(/−/g, '-');
  const male = /(?:남자|남성)\s*(?:키|버전|key\b|ver\b)|남키|\bmale\s*(?:key|ver(?:sion)?)\b/i.test(normalized);
  const female = /(?:여자|여성)\s*(?:키|버전|key\b|ver\b)|여키|\bfemale\s*(?:key|ver(?:sion)?)\b/i.test(normalized);
  const vocalMatches = preferences.vocal === 'any'
    || (preferences.vocal === 'male' && male && !female)
    || (preferences.vocal === 'female' && female && !male)
    || (preferences.vocal === 'duet' && /듀엣|\bduet\b/i.test(normalized));
  if (!vocalMatches) return false;
  if (preferences.keyOffset === 0) return true;

  const offsets = [
    ...Array.from(normalized.matchAll(/([+-])\s*(\d+)\s*(?:키|keys?\b|semitones?\b)/gi), (match) => Number(`${match[1]}${match[2]}`)),
    ...Array.from(normalized.matchAll(/(?:키|keys?)\s*([+-])\s*(\d+)(?![\d.])/gi), (match) => Number(`${match[1]}${match[2]}`)),
    ...Array.from(normalized.matchAll(/(\d+)\s*(?:키|keys?|semitones?)\s*(올림|높임|up|내림|낮춤|down)/gi),
      (match) => Number(match[1]) * (/올림|높임|up/i.test(match[2]) ? 1 : -1)),
  ];
  return offsets.includes(preferences.keyOffset);
}

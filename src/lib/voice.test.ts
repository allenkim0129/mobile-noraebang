import assert from 'node:assert/strict';
import { test } from 'node:test';
import { automaticVoiceSong, isExactOfficialSong, parseVoiceChoice, parseVoiceConfirmation, parseVoiceQuery, voiceCandidates } from './voice.js';
import type { Song } from '../types.js';

const song: Song = { id: 'abcdefghijk', title: '[TJ노래방] 밤편지 - 아이유 / TJ Karaoke', channelTitle: 'TJ', provider: 'tj' };

test('parses explicit Korean artist/title commands without inventing fields for free text', () => {
  assert.deepEqual(parseVoiceQuery('아이유의 밤편지 찾아줘.'), { query: '아이유 밤편지', artist: '아이유', title: '밤편지' });
  assert.deepEqual(parseVoiceQuery('한로로 에 입춘 검색해 줘'), { query: '한로로 입춘', artist: '한로로', title: '입춘' });
  assert.deepEqual(parseVoiceQuery('아이유 밤편지'), { query: '아이유 밤편지' });
  assert.equal(parseVoiceQuery('찾아줘'), null);
  assert.equal(parseVoiceQuery('a'.repeat(101)), null);
});

test('requires an explicit affirmative playback confirmation and rejects negated or ambiguous phrases', () => {
  for (const phrase of ['네', '응', '재생해', '재생해 줘', '틀어줘', '좋아요']) {
    assert.equal(parseVoiceConfirmation(phrase), 'play', phrase);
  }
  for (const phrase of ['재생하지 마', '네 말고 아니요', '틀어줄까', '다른 소리', '첫 번째']) {
    assert.equal(parseVoiceConfirmation(phrase), 'unknown', phrase);
  }
  assert.equal(parseVoiceConfirmation('아니요'), 'cancel');
  assert.equal(parseVoiceConfirmation('다시 검색'), 'search');
});

test('auto-selects only exact artist and title on official channels, prioritizing KY', () => {
  const query = parseVoiceQuery('아이유의 밤편지 찾아줘')!;
  const ky = { ...song, id: 'lmnopqrstuv', provider: 'ky' as const };
  const candidates = voiceCandidates({ official: [song, ky], alternatives: [], alternativesLoaded: false });
  assert.equal(automaticVoiceSong(candidates, query), ky);
  assert.equal(isExactOfficialSong({ ...ky, title: '아이유 - 밤편지' }, query), true);
  for (const title of ['밤편지 - 다른 가수', '밤편지 라이브 - 아이유', '밤편지 - 아이유 남자키', '밤편지 - 아이유 +2키', '밤편지 모음 - 아이유']) {
    assert.equal(isExactOfficialSong({ ...song, title }, query), false, title);
  }
  assert.equal(isExactOfficialSong({ ...song, provider: 'other' }, query), false);
  assert.equal(isExactOfficialSong(song, { query: '아이유 밤편지' }), false);
  assert.equal(automaticVoiceSong([song], { query: '아무 곡' }), undefined);
});

test('deduplicates candidates and parses only explicit selection commands', () => {
  assert.equal(voiceCandidates({ official: [song], alternatives: [song], alternativesLoaded: true }).length, 1);
  assert.deepEqual(parseVoiceChoice('첫 번째 재생해줘'), { type: 'select', index: 0 });
  assert.deepEqual(parseVoiceChoice('2번'), { type: 'select', index: 1 });
  assert.deepEqual(parseVoiceChoice('세 번째로 틀어줘'), { type: 'select', index: 2 });
  assert.deepEqual(parseVoiceChoice('세 번째'), { type: 'select', index: 2 });
  assert.deepEqual(parseVoiceChoice('취소'), { type: 'cancel' });
  assert.deepEqual(parseVoiceChoice('다시 검색'), { type: 'search' });
  assert.deepEqual(parseVoiceChoice('다른 후보'), { type: 'next' });
  assert.deepEqual(parseVoiceChoice('첫 번째 말고 두 번째'), { type: 'unknown' });
});

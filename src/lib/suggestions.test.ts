import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSearchSuggestions, rememberSearch } from './suggestions.js';

test('prioritizes title prefixes and returns at most six distinct search terms', () => {
  const suggestions = getSearchSuggestions('사랑');
  assert.equal(suggestions.length, 6);
  assert(suggestions.every((item) => item.label.startsWith('사랑') && !item.correction));
  assert.equal(suggestions[0].query, '사랑하게될거야 한로로');
  assert.equal(new Set(suggestions.map((item) => item.query)).size, suggestions.length);
});

test('matches artists, case, punctuation, spacing and canonically equivalent Hangul', () => {
  assert.equal(getSearchSuggestions('  dAy6  ')[0].query, 'DAY6');
  assert.equal(getSearchSuggestions('아이유')[0].kind, 'artist');
  assert.equal(getSearchSuggestions('한페이지가될수있게')[0].label, '한 페이지가 될 수 있게');
  assert.equal(getSearchSuggestions('love-wins')[0].label, 'Love wins all');
  assert.equal(getSearchSuggestions('밤편지'.normalize('NFD'))[0].query, '밤편지 아이유');
});

test('suggests conservative Korean jamo corrections and English transpositions', () => {
  const korean = getSearchSuggestions('사랑하개될거야');
  assert.equal(korean[0].query, '사랑하게될거야 한로로');
  assert.equal(korean[0].correction, true);
  assert.equal(getSearchSuggestions('밥편지')[0].query, '밤편지 아이유');
  const english = getSearchSuggestions('dya6');
  assert.equal(english[0].query, 'DAY6');
  assert.equal(english[0].correction, true);
  assert.equal(getSearchSuggestions('Adeel')[0].query, 'Adele');
  assert.equal(getSearchSuggestions('사라')[0].correction, false);
});

test('does not correct single-character or unrelated input or accept oversized input', () => {
  for (const input of ['', '   ', '!!!', '쀍', 'zzzzzzzz', 'z'.repeat(101)]) {
    assert.deepEqual(getSearchSuggestions(input), [], input);
  }
  assert(getSearchSuggestions('사').every((item) => !item.correction));
});

test('keeps recent queries local, bounded and deduplicated without changing previous arrays', () => {
  const initial = ['  밤편지 아이유 ', 'DAY6', '내가 고른 곡'];
  const recent = rememberSearch(initial, 'day6');
  assert.deepEqual(initial, ['  밤편지 아이유 ', 'DAY6', '내가 고른 곡']);
  assert.deepEqual(recent, ['day6', '  밤편지 아이유 ', '내가 고른 곡']);
  assert.equal(rememberSearch(recent, '   '), recent);
  assert.equal(rememberSearch(recent, 'x'.repeat(101)), recent);
  assert.equal(rememberSearch(Array.from({ length: 12 }, (_, i) => `최근 검색 ${i}`), '새 검색').length, 12);
  assert.equal(rememberSearch([], '  직접   찾는 곡  ')[0], '직접 찾는 곡');
  const suggestions = getSearchSuggestions('내가', recent);
  assert.equal(suggestions[0].kind, 'recent');
  assert.equal(suggestions[0].query, '내가 고른 곡');
});

test('deduplicates history and catalog without hiding better artist-first matches', () => {
  const recent = ['밤편지 아이유', '밤편지   아이유'];
  const suggestions = getSearchSuggestions('밤편지', recent);
  assert.equal(suggestions.filter((item) => item.query.replace(/\s+/g, '') === '밤편지아이유').length, 1);
  assert.equal(suggestions[0].kind, 'recent');
  assert.equal(getSearchSuggestions('아이유 밤편지', recent)[0].query, '밤편지 아이유');
  assert.equal(getSearchSuggestions('아이유 밤편지', recent)[0].kind, 'song');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PREFERENCES, hasPreferences, matchesPreferences, versionQuery } from './preferences.js';

test('builds search-only version terms without changing an unfiltered query', () => {
  assert.equal(versionQuery('입춘 한로로', DEFAULT_PREFERENCES), '입춘 한로로');
  assert.equal(versionQuery('입춘', { vocal: 'male', keyOffset: 2 }), '입춘 남자키 +2키');
  assert.equal(versionQuery('입춘', { vocal: 'duet', keyOffset: -3 }), '입춘 듀엣 -3키');
  assert.equal(hasPreferences(DEFAULT_PREFERENCES), false);
});

test('requires explicit version labels rather than inferring a singer or matching female as male', () => {
  assert.equal(matchesPreferences('한로로 입춘', { vocal: 'female', keyOffset: 0 }), false);
  assert.equal(matchesPreferences('입춘 Female Key', { vocal: 'male', keyOffset: 0 }), false);
  assert.equal(matchesPreferences('입춘 Male Version', { vocal: 'male', keyOffset: 0 }), true);
  assert.equal(matchesPreferences('입춘 여자 키', { vocal: 'female', keyOffset: 0 }), true);
  assert.equal(matchesPreferences('입춘 남자키 여자키', { vocal: 'male', keyOffset: 0 }), false);
  assert.equal(matchesPreferences('입춘 duet MR', { vocal: 'duet', keyOffset: 0 }), true);
});

test('matches signed semitone labels exactly and requires both selected conditions', () => {
  for (const title of ['남자키 +2키', '남자키 key +2', '남자키 2키 올림', '남자키 ＋２키']) {
    assert.equal(matchesPreferences(title, { vocal: 'male', keyOffset: 2 }), true, title);
  }
  for (const title of ['여자키 +2키', '남자키 -2키', '남자키 +12키', '남자키 +2.5키', '남자키 원키']) {
    assert.equal(matchesPreferences(title, { vocal: 'male', keyOffset: 2 }), false, title);
  }
  assert.equal(matchesPreferences('여자키 −3키', { vocal: 'female', keyOffset: -3 }), true);
  assert.equal(matchesPreferences('여자키 3 key down', { vocal: 'female', keyOffset: -3 }), true);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendToQueue, decodeTitle, displayTitle } from './songs.js';
import type { Song } from '../types.js';

const id = 'abcdefghijk';

test('cleans official title wrappers and safely decodes entities as text', () => {
  assert.equal(displayTitle('[TJ노래방] 밤편지 - 아이유 / TJ Karaoke'), '밤편지 - 아이유');
  assert.equal(displayTitle('[TJ노래방 / MR Live] Song &amp; Song / TJ Karaoke'), 'Song & Song');
  assert.equal(displayTitle('Song (KY.12345) / KY KARAOKE'), 'Song (KY.12345)');
  assert.equal(decodeTitle('&quot;밤&#39; &#x266A; &#44032; &lt;b&gt;'), '"밤\' ♪ 가 <b>');
  assert.equal(decodeTitle('&#999999999;'), '&#999999999;');
});

test('queues unique songs in insertion order without mutating existing entries', () => {
  const first: Song = { id, title: '첫 곡', channelTitle: 'TJ', provider: 'tj' };
  const second: Song = { ...first, id: 'lmnopqrstuv', title: '다음 곡' };
  const initial: Song[] = [];
  const queue = appendToQueue(appendToQueue(initial, first), second);
  assert.deepEqual(initial, []);
  assert.deepEqual(queue, [first, second]);
  assert.equal(appendToQueue(queue, first), queue);
});

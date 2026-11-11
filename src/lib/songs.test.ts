import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendToQueue, decodeTitle, displayTitle, moveInQueue } from './songs.js';
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

test('moves queued songs one position without changing identities or mutating the queue', () => {
  const first: Song = { id, title: '첫 곡', channelTitle: '금영', provider: 'ky' };
  const second: Song = { ...first, id: 'lmnopqrstuv', title: '두 번째 곡' };
  const third: Song = { ...first, id: '12345678901', title: '세 번째 곡' };
  const queue = [first, second, third];
  const moved = moveInQueue(queue, second.id, -1);
  assert.deepEqual(moved, [second, first, third]);
  assert.deepEqual(queue, [first, second, third]);
  assert.equal(moved[0], second);
  assert.deepEqual(moveInQueue(moved, second.id, 1), queue);
  assert.deepEqual(moveInQueue(queue, third.id, -1), [first, third, second]);
});

test('keeps queue boundaries, missing songs and empty queues unchanged', () => {
  const first: Song = { id, title: '첫 곡', channelTitle: '금영', provider: 'ky' };
  const queue = [first];
  assert.equal(moveInQueue(queue, first.id, -1), queue);
  assert.equal(moveInQueue(queue, first.id, 1), queue);
  assert.equal(moveInQueue(queue, 'not-queued', 1), queue);
  const empty: Song[] = [];
  assert.equal(moveInQueue(empty, first.id, -1), empty);
});

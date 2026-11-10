import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendToQueue, decodeTitle, displayTitle, songFromUrl } from './songs.js';
import type { Song } from '../types.js';

const id = 'abcdefghijk';

test('accepts supported YouTube video URL formats without fetching arbitrary URLs', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}&t=20`,
    `https://youtu.be/${id}?si=share`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtube.com/shorts/${id}`,
    `https://youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) {
    assert.equal(songFromUrl(url)?.id, id, url);
    assert.equal(songFromUrl(url)?.provider, 'other');
  }
});

test('rejects spoofed hosts, invalid IDs, credentials, scripts and playlist-only links', () => {
  for (const url of [
    `https://youtube.com.evil.example/watch?v=${id}`,
    `https://example.com/watch?v=${id}`,
    `https://youtube.com@evil.example/watch?v=${id}`,
    `https://user:pass@youtube.com/watch?v=${id}`,
    `ftp://youtube.com/watch?v=${id}`,
    `javascript:alert(1)`,
    `https://youtu.be/${id}/extra`,
    `https://youtube.com/playlist?list=${id}`,
    'https://youtube.com/watch?v=short',
    'https://youtube.com/watch?v=abcdefghij!',
    'not a URL',
  ]) assert.equal(songFromUrl(url), null, url);
});

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

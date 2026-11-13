import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recognitionTranscript } from './speech.js';

test('shows interim revisions without treating them as executable commands', () => {
  assert.deepEqual(recognitionTranscript([{ isFinal: false, 0: { transcript: '재생해' } }]), { text: '재생해', isFinal: false });
  assert.deepEqual(recognitionTranscript([{ isFinal: false, 0: { transcript: '재생하지 마' } }]), { text: '재생하지 마', isFinal: false });
  assert.deepEqual(recognitionTranscript([{ isFinal: true, 0: { transcript: ' 아이유의 밤편지 찾아줘 ' } }]), { text: '아이유의 밤편지 찾아줘', isFinal: true });
});

test('combines result segments once and waits for every segment to be final', () => {
  assert.deepEqual(recognitionTranscript([
    { isFinal: true, 0: { transcript: '아이유의' } },
    { isFinal: false, 0: { transcript: '밤편지 찾아줘' } },
  ]), { text: '아이유의 밤편지 찾아줘', isFinal: false });
  assert.deepEqual(recognitionTranscript([
    { isFinal: true, 0: { transcript: '아이유의' } },
    { isFinal: true, 0: { transcript: '밤편지 찾아줘' } },
  ]), { text: '아이유의 밤편지 찾아줘', isFinal: true });
  assert.deepEqual(recognitionTranscript([]), { text: '', isFinal: false });
  assert.deepEqual(recognitionTranscript([{ isFinal: true, 0: { transcript: ' ' } }]), { text: '', isFinal: true });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSearchKeyboardViewport } from './viewport.js';

const landscape = { layoutHeight: 390, height: 134, offsetTop: 0, scale: 1, focused: true, landscape: true };

test('uses the visible area above a landscape keyboard, including Safari viewport panning', () => {
  assert.deepEqual(getSearchKeyboardViewport(landscape), { height: 134, top: 0 });
  assert.deepEqual(getSearchKeyboardViewport({ ...landscape, height: 110, offsetTop: 32 }), { height: 110, top: 32 });
});

test('does not enter keyboard layout for browser chrome, pinch zoom, portrait or unfocused input', () => {
  assert.equal(getSearchKeyboardViewport({ ...landscape, height: 330 }), null);
  assert.equal(getSearchKeyboardViewport({ ...landscape, scale: 2 }), null);
  assert.equal(getSearchKeyboardViewport({ ...landscape, focused: false }), null);
  assert.equal(getSearchKeyboardViewport({ ...landscape, landscape: false }), null);
  assert.equal(getSearchKeyboardViewport({ ...landscape, height: 390 }), null);
});

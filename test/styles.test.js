import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, getStyle } from '../modules/styles/index.js';
import { polygonStyle } from '../modules/styles/polygonStyle.js';
import { roundedStyle } from '../modules/styles/roundedStyle.js';
import { rectangularStyle } from '../modules/styles/rectangularStyle.js';

test('getStyle looks styles up by id', () => {
  assert.equal(getStyle('rounded'), roundedStyle);
  assert.equal(getStyle('rectangular'), rectangularStyle);
  assert.equal(getStyle('polygon'), polygonStyle);
});

test('getStyle throws on an unknown id', () => {
  assert.throws(() => getStyle('nope'), /Unknown geometry style/);
});

test('STYLES registers every known style exactly once', () => {
  assert.deepEqual(STYLES.map(s => s.id), ['polygon', 'rounded', 'rectangular']);
});

test('polygonStyle resolves sides and twist directly from config', () => {
  assert.equal(polygonStyle.resolveSides({ sides: 7 }), 7);
  assert.equal(polygonStyle.twistScale({}), 1);
  const factory = polygonStyle.createPointFactory({});
  assert.equal(factory(7, 10).length, 7);
});

test('roundedStyle twist scale matches its corner-segment point count', () => {
  assert.equal(roundedStyle.resolveSides({ sides: 8 }), 8);
  assert.equal(roundedStyle.twistScale({}), 21); // CORNER_SEGMENTS (20) + 1
  const factory = roundedStyle.createPointFactory({ cornerSmoothing: 20, polyRadius: 6 });
  assert.equal(factory(6, 6).length, 6 * 21);
});

test('rectangularStyle derives sides from ratio and keeps a fixed twist scale', () => {
  assert.equal(rectangularStyle.resolveSides({ ratio: 5 }), 10);
  assert.equal(rectangularStyle.twistScale({}), 2);
  const factory = rectangularStyle.createPointFactory({});
  assert.equal(factory(10, 6).length, 4);
});

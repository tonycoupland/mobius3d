import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createPolygonPoints,
  createPolygonPointsInRectangular,
  createRoundedPolygonPoints,
  generateGeometry,
} from '../modules/mobius.js';

test('createPolygonPoints returns one point per side, each at the given radius', () => {
  const points = createPolygonPoints(6, 10);
  assert.equal(points.length, 6);
  points.forEach(p => assert.ok(Math.abs(p.length() - 10) < 1e-9));
  assert.ok(points[0] instanceof THREE.Vector3);
  assert.ok(Math.abs(points[0].x - 10) < 1e-9 && Math.abs(points[0].y) < 1e-9);
});

test('createPolygonPointsInRectangular keeps 4 points for an even side count', () => {
  const points = createPolygonPointsInRectangular(6, 10);
  assert.equal(points.length, 4);
});

test('createPolygonPointsInRectangular keeps 3 points for an odd side count', () => {
  const points = createPolygonPointsInRectangular(5, 10);
  assert.equal(points.length, 3);
});

test('createRoundedPolygonPoints returns segmentsPerCorner+1 points per side', () => {
  const sides = 6;
  const segmentsPerCorner = 4;
  const points = createRoundedPolygonPoints(sides, 10, 1, segmentsPerCorner);
  assert.equal(points.length, sides * (segmentsPerCorner + 1));
});

test('generateGeometry produces a fully stitched triangle strip', () => {
  const sides = 5;
  const segments = 8;
  const geom = generateGeometry(sides, 6, 40, segments, 1, createPolygonPoints);
  const position = geom.getAttribute('position');
  // fillSides emits 2 triangles (6 verts x 3 floats) per point, per segment
  assert.equal(position.array.length, segments * sides * 6 * 3);
});

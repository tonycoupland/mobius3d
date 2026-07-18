import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPinTransforms, createPinGeometry, createBearingGeometry, createChainGeometry } from '../modules/chain.js';

// A cylinder's own two cap-centre vertices are the only ones sitting
// exactly length/2 from its geometric centre (every other vertex is
// farther away, out on the radius); every vertex is within
// sqrt(radius^2 + (length/2)^2) of it. Checking those two extremes per
// station confirms each cylinder is centred exactly on its transform's
// position without depending on the cap triangulation's exact vertex order.
function assertStationCylindersCentered(transforms, position, blockOffset, vertsPerCylinder, radius, length) {
  const expectedMin = length / 2;
  const expectedMax = Math.sqrt(radius ** 2 + (length / 2) ** 2);

  transforms.forEach((transform, i) => {
    let minDist = Infinity;
    let maxDist = 0;
    for (let v = 0; v < vertsPerCylinder; v++) {
      const idx = blockOffset + i * vertsPerCylinder + v;
      const vertex = new THREE.Vector3(position.getX(idx), position.getY(idx), position.getZ(idx));
      const dist = vertex.distanceTo(transform.position);
      minDist = Math.min(minDist, dist);
      maxDist = Math.max(maxDist, dist);
    }
    assert.ok(Math.abs(minDist - expectedMin) < 1e-4);
    assert.ok(Math.abs(maxDist - expectedMax) < 1e-4);
  });
}

test('createPinTransforms returns one transform per link, evenly spaced by angle on the ring', () => {
  const linkCount = 8;
  const transforms = createPinTransforms(linkCount, 40, 0);
  assert.equal(transforms.length, linkCount);
  transforms.forEach((transform, i) => {
    const expectedAngle = (i / linkCount) * 2 * Math.PI;
    assert.ok(Math.abs(transform.angle - expectedAngle) < 1e-9);
    assert.ok(Math.abs(transform.position.length() - 40) < 1e-9);
  });
});

test('createPinTransforms accumulates twist linearly toward twists * 180 degrees', () => {
  const linkCount = 6;
  const twists = 1.5;
  const transforms = createPinTransforms(linkCount, 40, twists);
  const totalTwistRad = THREE.MathUtils.degToRad(180 * twists);

  transforms.forEach((transform, i) => {
    const expected = (i / linkCount) * totalTwistRad;
    assert.ok(Math.abs(transform.twist - expected) < 1e-9);
  });

  // the twist delta from the last pin back to a hypothetical pin at i = linkCount
  // matches the constant per-step delta, so the closing seam doesn't jump
  const perStepDelta = totalTwistRad / linkCount;
  const lastDelta = totalTwistRad - transforms[linkCount - 1].twist;
  assert.ok(Math.abs(lastDelta - perStepDelta) < 1e-9);
});

test('a twists value of 1 is a half twist (180 degrees) and 2 is a full twist (360 degrees)', () => {
  const linkCount = 8;
  const half = createPinTransforms(linkCount, 40, 1);
  const full = createPinTransforms(linkCount, 40, 2);
  assert.ok(Math.abs(half[linkCount - 1].twist + (Math.PI / linkCount) - Math.PI) < 1e-9);
  assert.ok(Math.abs(full[linkCount - 1].twist + (2 * Math.PI / linkCount) - 2 * Math.PI) < 1e-9);
});

test('total twist is independent of linkCount', () => {
  const twists = 2;
  const coarse = createPinTransforms(6, 40, twists);
  const fine = createPinTransforms(12, 40, twists);
  // i=3 of 6 and i=6 of 12 are both the halfway point around the loop (t=0.5),
  // so their accumulated twist should match even though linkCount differs.
  assert.ok(Math.abs(coarse[3].twist - fine[6].twist) < 1e-9);

  const totalTwistRad = THREE.MathUtils.degToRad(180 * twists);
  assert.ok(Math.abs(totalTwistRad - THREE.MathUtils.degToRad(360)) < 1e-9);
});

test('twists = 0 closes the loop untwisted', () => {
  const transforms = createPinTransforms(6, 40, 0);
  transforms.forEach(transform => assert.ok(Math.abs(transform.twist) < 1e-9));
});

test('createPinGeometry produces one merged cylinder per link', () => {
  const linkCount = 5;
  const geom = createPinGeometry(1, 4, linkCount, 40, 0);
  const position = geom.getAttribute('position');

  const singleCylinder = new THREE.CylinderGeometry(1, 1, 4, 12);
  const vertsPerCylinder = singleCylinder.getAttribute('position').count;

  assert.equal(position.count, vertsPerCylinder * linkCount);
});

test('createPinGeometry centres each pin at its transform position', () => {
  const linkCount = 5;
  const ringRadius = 40;
  const pinRadius = 1;
  const pinLength = 4;
  const geom = createPinGeometry(pinRadius, pinLength, linkCount, ringRadius, 0);
  const transforms = createPinTransforms(linkCount, ringRadius, 0);
  const position = geom.getAttribute('position');

  const singleCylinder = new THREE.CylinderGeometry(pinRadius, pinRadius, pinLength, 12);
  const vertsPerCylinder = singleCylinder.getAttribute('position').count;

  assertStationCylindersCentered(transforms, position, 0, vertsPerCylinder, pinRadius, pinLength);
});

test('createBearingGeometry produces one merged cylinder per link, centred on its transform', () => {
  const linkCount = 5;
  const ringRadius = 40;
  const bearingRadius = 2;
  const bearingLength = 3;
  const geom = createBearingGeometry(bearingRadius, bearingLength, linkCount, ringRadius, 0);
  const transforms = createPinTransforms(linkCount, ringRadius, 0);
  const position = geom.getAttribute('position');

  const singleCylinder = new THREE.CylinderGeometry(bearingRadius, bearingRadius, bearingLength, 12);
  const vertsPerCylinder = singleCylinder.getAttribute('position').count;

  assert.equal(position.count, vertsPerCylinder * linkCount);
  assertStationCylindersCentered(transforms, position, 0, vertsPerCylinder, bearingRadius, bearingLength);
});

test('createChainGeometry merges pins and bearings, both sharing the same station transforms', () => {
  const linkCount = 5;
  const ringRadius = 40;
  const pinRadius = 1;
  const pinLength = 4;
  const bearingRadius = 2;
  const bearingLength = 3;
  const geom = createChainGeometry(pinRadius, pinLength, bearingRadius, bearingLength, linkCount, ringRadius, 0.5);
  const transforms = createPinTransforms(linkCount, ringRadius, 0.5);
  const position = geom.getAttribute('position');

  const singleCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const vertsPerCylinder = singleCylinder.getAttribute('position').count;

  assert.equal(position.count, vertsPerCylinder * linkCount * 2);
  // pins occupy the first block of vertices, bearings the second
  assertStationCylindersCentered(transforms, position, 0, vertsPerCylinder, pinRadius, pinLength);
  assertStationCylindersCentered(transforms, position, vertsPerCylinder * linkCount, vertsPerCylinder, bearingRadius, bearingLength);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createPinTransforms, createPinGeometry, createBearingGeometry,
  createClosingStationTransform, createLinkGeometry, createChainLinksGeometry, createChainGeometry,
} from '../modules/chain.js';

function orientationDelta(m1, m2) {
  const q1 = new THREE.Quaternion().setFromRotationMatrix(m1);
  const q2 = new THREE.Quaternion().setFromRotationMatrix(m2);
  return q1.angleTo(q2);
}

function anyVertexNear(position, point, tolerance = 1e-4) {
  for (let i = 0; i < position.count; i++) {
    const vertex = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
    if (vertex.distanceTo(point) < tolerance) return true;
  }
  return false;
}

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

test('createClosingStationTransform lands on station 0\'s position but continues the twist past it', () => {
  const linkCount = 8;
  const ringRadius = 40;
  const twists = 1;
  const transforms = createPinTransforms(linkCount, ringRadius, twists);
  const closing = createClosingStationTransform(linkCount, ringRadius, twists);

  // angle wraps to the same physical point as station 0 (cos/sin of 2*PI == of 0)
  assert.ok(closing.position.distanceTo(transforms[0].position) < 1e-9);

  // twist continues on by one more per-step delta past the last real
  // station, rather than resetting to transforms[0].twist (0) -- this is
  // what lets the closing gap span the same delta as every other gap
  // instead of the whole accumulated twist (see createChainLinksGeometry).
  const totalTwistRad = THREE.MathUtils.degToRad(180 * twists);
  const perStepDelta = totalTwistRad / linkCount;
  const expectedTwist = transforms[linkCount - 1].twist + perStepDelta;
  assert.ok(Math.abs(closing.twist - expectedTwist) < 1e-9);
});

test('createPinGeometry produces one merged cylinder per link', () => {
  const linkCount = 5;
  const geom = createPinGeometry(1, 4, linkCount, 40, 0);
  const position = geom.getAttribute('position');

  const singleCylinder = new THREE.CylinderGeometry(1, 1, 4, 12).toNonIndexed();
  const vertsPerCylinder = singleCylinder.getAttribute('position').count;

  assert.equal(position.count, vertsPerCylinder * linkCount);
});

test('createPinGeometry accepts a radialSegments override, controlling how round it is', () => {
  const linkCount = 3;
  const radialSegments = 6;
  const geom = createPinGeometry(1, 4, linkCount, 40, 0, radialSegments);
  const position = geom.getAttribute('position');

  const singleCylinder = new THREE.CylinderGeometry(1, 1, 4, radialSegments).toNonIndexed();
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

  const singleCylinder = new THREE.CylinderGeometry(pinRadius, pinRadius, pinLength, 12).toNonIndexed();
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

  const singleCylinder = new THREE.CylinderGeometry(bearingRadius, bearingRadius, bearingLength, 12).toNonIndexed();
  const vertsPerCylinder = singleCylinder.getAttribute('position').count;

  assert.equal(position.count, vertsPerCylinder * linkCount);
  assertStationCylindersCentered(transforms, position, 0, vertsPerCylinder, bearingRadius, bearingLength);
});

test('createLinkGeometry front/back rings wrap loopRadius around both end stations and pinch to waistRadius at the midpoint', () => {
  const start = { position: new THREE.Vector3(0, 0, 0), matrix: new THREE.Matrix4() };
  const end = { position: new THREE.Vector3(0, 0, 10), matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2) };
  const loopRadius = 3;
  const waistRadius = 1;
  const thickness = 0.4;
  const halfThickness = thickness / 2;
  const radialSegments = 8;
  const lengthSegments = 4;

  const geom = createLinkGeometry(start, end, { loopRadius, waistRadius, thickness, radialSegments, lengthSegments });
  const position = geom.getAttribute('position');

  [-halfThickness, halfThickness].forEach(xOffset => {
    for (let j = 0; j < radialSegments; j++) {
      const theta = (j / radialSegments) * 2 * Math.PI;
      const local = new THREE.Vector3(0, Math.cos(theta) * loopRadius, Math.sin(theta) * loopRadius);

      const axialShiftAtStart = new THREE.Vector3(xOffset, 0, 0).applyMatrix4(start.matrix);
      const expectedAtStart = local.clone().applyMatrix4(start.matrix).add(start.position).add(axialShiftAtStart);
      assert.ok(anyVertexNear(position, expectedAtStart), 'expected a loopRadius ring vertex at the start station');

      const axialShiftAtEnd = new THREE.Vector3(xOffset, 0, 0).applyMatrix4(end.matrix);
      const expectedAtEnd = local.clone().applyMatrix4(end.matrix).add(end.position).add(axialShiftAtEnd);
      assert.ok(anyVertexNear(position, expectedAtEnd), 'expected a loopRadius ring vertex at the end station');
    }
  });

  // the midpoint (s=0.5) orientation is the slerp of the two end orientations,
  // per Decision 5 (the twist happens along the link's length, not at its ends)
  const q1 = new THREE.Quaternion().setFromRotationMatrix(start.matrix);
  const q2 = new THREE.Quaternion().setFromRotationMatrix(end.matrix);
  const midMatrix = new THREE.Matrix4().makeRotationFromQuaternion(q1.clone().slerp(q2, 0.5));
  const midPosition = start.position.clone().lerp(end.position, 0.5);

  [-halfThickness, halfThickness].forEach(xOffset => {
    const axialShift = new THREE.Vector3(xOffset, 0, 0).applyMatrix4(midMatrix);
    for (let j = 0; j < radialSegments; j++) {
      const theta = (j / radialSegments) * 2 * Math.PI;
      const expectedAtWaist = new THREE.Vector3(0, Math.cos(theta) * waistRadius, Math.sin(theta) * waistRadius)
        .applyMatrix4(midMatrix)
        .add(midPosition)
        .add(axialShift);
      assert.ok(anyVertexNear(position, expectedAtWaist), 'expected a waistRadius ring vertex at the midpoint');
    }
  });
});

test('createLinkGeometry keeps a flat "doughnut" cap at loopRadius/start-orientation before the connector begins tapering', () => {
  const start = { position: new THREE.Vector3(0, 0, 0), matrix: new THREE.Matrix4() };
  const end = { position: new THREE.Vector3(0, 0, 10), matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2) };
  const loopRadius = 3;
  const waistRadius = 1;
  const radialSegments = 8;
  const lengthSegments = 8;
  const capFraction = 0.25;

  const geom = createLinkGeometry(start, end, {
    loopRadius, waistRadius, thickness: 0, radialSegments, lengthSegments, capFraction,
  });
  const position = geom.getAttribute('position');

  // s = 1/8 = 0.125 is still inside the cap (capFraction = 0.25), so this
  // ring should be identical to the s=0 ring: still loopRadius, and still
  // exactly the start station's own orientation rather than already
  // slerping toward the end station -- this is what keeps the link's end
  // flush with the bearing instead of curving away from it immediately.
  for (let j = 0; j < radialSegments; j++) {
    const theta = (j / radialSegments) * 2 * Math.PI;
    const expected = new THREE.Vector3(0, Math.cos(theta) * loopRadius, Math.sin(theta) * loopRadius)
      .applyMatrix4(start.matrix)
      .add(start.position);
    assert.ok(anyVertexNear(position, expected), 'expected the cap region to stay flush with the start station');
  }
});

test('createLinkGeometry thickness separates the front and back faces along the local pin axis, not the outline itself', () => {
  const start = { position: new THREE.Vector3(0, 0, 0), matrix: new THREE.Matrix4() };
  const end = { position: new THREE.Vector3(0, 0, 10), matrix: new THREE.Matrix4() };
  const loopRadius = 3;
  const waistRadius = 1;
  const radialSegments = 8;
  const lengthSegments = 4;
  const midPosition = start.position.clone().lerp(end.position, 0.5);

  const thin = createLinkGeometry(start, end, { loopRadius, waistRadius, thickness: 0.2, radialSegments, lengthSegments }).getAttribute('position');
  const thick = createLinkGeometry(start, end, { loopRadius, waistRadius, thickness: 4, radialSegments, lengthSegments }).getAttribute('position');

  // each geometry's face sits at its own thickness/2 along the local pin
  // axis (X), with the same waistRadius outline (theta=0, local Y) either
  // way -- this is what was missing before: thickness now visibly
  // separates the two faces instead of distorting the Y-Z outline
  const thinFace = midPosition.clone().add(new THREE.Vector3(0.1, waistRadius, 0));
  const thickFace = midPosition.clone().add(new THREE.Vector3(2, waistRadius, 0));
  assert.ok(anyVertexNear(thin, thinFace));
  assert.ok(!anyVertexNear(thin, thickFace));
  assert.ok(anyVertexNear(thick, thickFace));
  assert.ok(!anyVertexNear(thick, thinFace));
});

test('createLinkGeometry stitches a rim connecting the front and back faces at every length step', () => {
  const start = { position: new THREE.Vector3(0, 0, 0), matrix: new THREE.Matrix4() };
  const end = { position: new THREE.Vector3(0, 0, 10), matrix: new THREE.Matrix4() };
  const radialSegments = 6;
  const lengthSegments = 2;

  const geom = createLinkGeometry(start, end, { loopRadius: 3, waistRadius: 1, thickness: 1, radialSegments, lengthSegments });
  const position = geom.getAttribute('position');

  const frontFaceVerts = lengthSegments * radialSegments * 6;
  const backFaceVerts = lengthSegments * radialSegments * 6;
  const rimVerts = (lengthSegments + 1) * radialSegments * 6;

  assert.equal(position.count, frontFaceVerts + backFaceVerts + rimVerts);
});

test('createLinkGeometry axialOffset shifts the whole plate along the local pin axis', () => {
  const start = { position: new THREE.Vector3(0, 0, 0), matrix: new THREE.Matrix4() };
  const end = { position: new THREE.Vector3(0, 0, 10), matrix: new THREE.Matrix4() };
  const loopRadius = 3;
  const axialOffset = 2;

  const geom = createLinkGeometry(start, end, {
    loopRadius, waistRadius: 1, thickness: 0, axialOffset, radialSegments: 6, lengthSegments: 2,
  });
  const position = geom.getAttribute('position');

  // thickness=0 collapses the front/back faces onto the same offset, so
  // the ring centre at the start station is exactly (axialOffset, 0, 0)
  // (start.matrix is identity, so local X is world X)
  const expected = new THREE.Vector3(axialOffset, loopRadius, 0);
  assert.ok(anyVertexNear(position, expected));
});

test('createChainLinksGeometry places two plates per gap, alternating inner/outer separation', () => {
  const linkCount = 4;
  const ringRadius = 40;
  const loopRadius = 3;
  const waistRadius = 1;
  const innerSeparation = 2;
  const outerSeparation = 5;
  const radialSegments = 6;
  const lengthSegments = 2;

  const geom = createChainLinksGeometry(linkCount, ringRadius, 0, {
    loopRadius, waistRadius, thickness: 0, innerSeparation, outerSeparation, radialSegments, lengthSegments,
  });
  const transforms = createPinTransforms(linkCount, ringRadius, 0);
  const position = geom.getAttribute('position');
  // thickness=0 collapses front/back onto the same points, but the geometry
  // still includes a front face, a back face, and a rim (see createLinkGeometry)
  const vertsPerPlate = radialSegments * 6 * (2 * lengthSegments + (lengthSegments + 1));

  assert.equal(position.count, vertsPerPlate * linkCount * 2);

  for (let i = 0; i < linkCount; i++) {
    const separation = i % 2 === 0 ? innerSeparation : outerSeparation;
    const start = transforms[i];
    const localX = new THREE.Vector3(1, 0, 0).applyMatrix4(start.matrix);

    [separation / 2, -separation / 2].forEach((axialOffset, plateIndex) => {
      const plateBlockStart = (i * 2 + plateIndex) * vertsPerPlate;
      const centreAtStart = start.position.clone().add(localX.clone().multiplyScalar(axialOffset));

      let found = false;
      for (let v = 0; v < radialSegments; v++) {
        const idx = plateBlockStart + v * 6;
        const vertex = new THREE.Vector3(position.getX(idx), position.getY(idx), position.getZ(idx));
        if (Math.abs(vertex.distanceTo(centreAtStart) - loopRadius) < 1e-4) found = true;
      }
      assert.ok(found, `expected a loopRadius-distant vertex for gap ${i} plate ${plateIndex}`);
    });
  }
});

test('the closing gap spans the same twist delta as every other gap, not the whole accumulated twist', () => {
  const linkCount = 6;
  const ringRadius = 40;
  const twists = 1; // 180 degrees total -- the old bug crammed nearly all of this into the last link

  const transforms = createPinTransforms(linkCount, ringRadius, twists);
  const closing = createClosingStationTransform(linkCount, ringRadius, twists);

  const perStepGapDelta = orientationDelta(transforms[0].matrix, transforms[1].matrix);
  const closingGapDelta = orientationDelta(transforms[linkCount - 1].matrix, closing.matrix);
  assert.ok(Math.abs(closingGapDelta - perStepGapDelta) < 1e-9);

  // sanity check: naively wrapping to transforms[0] (the old, buggy
  // behaviour) gives a much larger delta for this twists value
  const buggyDelta = orientationDelta(transforms[linkCount - 1].matrix, transforms[0].matrix);
  assert.ok(buggyDelta > perStepGapDelta * 2);
});

test('createChainGeometry merges pins, bearings, and links, all sharing the same station transforms', () => {
  const linkCount = 5;
  const ringRadius = 40;
  const pinRadius = 1;
  const pinLength = 4;
  const bearingRadius = 2;
  const bearingLength = 3;

  const geom = createChainGeometry({
    linkCount, ringRadius, twists: 0.5,
    pinRadius, pinLength, bearingRadius, bearingLength,
    linkWaistRadius: 0.5, linkThickness: 0.5, linkInnerSeparation: 1, linkOuterSeparation: 2,
  });
  const transforms = createPinTransforms(linkCount, ringRadius, 0.5);
  const position = geom.getAttribute('position');

  const singleCylinder = new THREE.CylinderGeometry(1, 1, 1, 12).toNonIndexed();
  const vertsPerCylinder = singleCylinder.getAttribute('position').count;
  // createChainGeometry uses createLinkGeometry's defaults (lengthSegments=8,
  // radialSegments=12): a front face, a back face, and a rim
  const vertsPerPlate = 12 * 6 * (2 * 8 + (8 + 1));

  const expectedCount = vertsPerCylinder * linkCount * 2 + vertsPerPlate * linkCount * 2;
  assert.equal(position.count, expectedCount);

  // pins occupy the first block of vertices, bearings the second
  assertStationCylindersCentered(transforms, position, 0, vertsPerCylinder, pinRadius, pinLength);
  assertStationCylindersCentered(transforms, position, vertsPerCylinder * linkCount, vertsPerCylinder, bearingRadius, bearingLength);
});

test('createChainGeometry ties the link taper resolution (lengthSegments) to the same Smoothness value as radialSegments', () => {
  // Pins/bearings have a constant radius along their length, so only
  // radialSegments affects how round they look; links taper from
  // loopRadius to waistRadius and back, so that taper needs its own
  // resolution (lengthSegments) tied to the same Smoothness control, or it
  // stays faceted regardless of how round the circular cross-section is.
  const linkCount = 4;
  const ringRadius = 40;
  const radialSegments = 6;

  const geom = createChainGeometry({
    linkCount, ringRadius, twists: 0,
    pinRadius: 1, pinLength: 4, bearingRadius: 2, bearingLength: 3,
    linkWaistRadius: 0.5, linkThickness: 0.5, linkInnerSeparation: 1, linkOuterSeparation: 2,
    radialSegments,
  });
  const position = geom.getAttribute('position');

  const singleCylinder = new THREE.CylinderGeometry(1, 1, 1, radialSegments).toNonIndexed();
  const vertsPerCylinder = singleCylinder.getAttribute('position').count;
  // lengthSegments should now equal radialSegments too, both driven by Smoothness
  const vertsPerPlate = radialSegments * 6 * (2 * radialSegments + (radialSegments + 1));

  const expectedCount = vertsPerCylinder * linkCount * 2 + vertsPerPlate * linkCount * 2;
  assert.equal(position.count, expectedCount);
});

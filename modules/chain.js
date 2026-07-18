import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// `twists` counts half-turns (180 degrees each) made over one lap,
// independent of linkCount (unlike the sweep styles in mobius.js, where
// "twist" is measured in units of the cross-section's own point count).
// Odd values are what produce a genuine Mobius join, so a value of 1 is a
// half twist (180 degrees) and a value of 2 is a full twist (360 degrees).
function totalTwistRadians(twists) {
  return THREE.MathUtils.degToRad(180 * twists);
}

// The per-station position + orientation, parameterized by a continuous
// station index `i` rather than clamped to [0, linkCount) -- passing
// i = linkCount gives the "next station after the last one", used to close
// the final gap (see createChainLinksGeometry) without wrapping the twist
// value back to 0.
function computeStationTransform(i, linkCount, ringRadius, totalTwistRad) {
  const t = i / linkCount;
  const angle = t * 2 * Math.PI;
  const twist = t * totalTwistRad;

  const position = new THREE.Vector3(
    Math.cos(angle) * ringRadius,
    Math.sin(angle) * ringRadius,
    0
  );

  // Same "face outward" + incremental-twist composition as generateGeometry
  // (modules/mobius.js), collapsed into a single matrix for a single frame
  // instead of per cross-section point.
  const rotY = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const rotZ = new THREE.Matrix4().makeRotationZ(angle);
  const faceMatrix = new THREE.Matrix4().multiply(rotZ).multiply(rotY);
  const twistMatrix = new THREE.Matrix4().makeRotationZ(twist);
  const matrix = new THREE.Matrix4().multiply(faceMatrix).multiply(twistMatrix);

  return { index: i, position, angle, twist, matrix };
}

export function createPinTransforms(linkCount, ringRadius, twists) {
  const totalTwistRad = totalTwistRadians(twists);
  const transforms = [];
  for (let i = 0; i < linkCount; i++) {
    transforms.push(computeStationTransform(i, linkCount, ringRadius, totalTwistRad));
  }
  return transforms;
}

// The "next station after the last one" -- same position as station 0
// (angle wraps to a full 2*PI, landing back on the same point), but with
// twist continuing on to totalTwistRad instead of resetting to 0. Used to
// close the final link so it spans the same per-step twist delta as every
// other link, instead of slerping across the *entire* accumulated twist
// (see createChainLinksGeometry).
export function createClosingStationTransform(linkCount, ringRadius, twists) {
  return computeStationTransform(linkCount, linkCount, ringRadius, totalTwistRadians(twists));
}

// Places one cylinder per station transform, sharing its position and
// orientation exactly (used for both the pin and the concentric bearing
// barrel around it, per Decision 5 in TODO-bike-chain.md).
function createStationCylinderGeometry(radius, length, transforms, radialSegments) {
  const geometries = transforms.map(({ position, matrix }) => {
    // Non-indexed to match createLinkGeometry's raw triangle list --
    // BufferGeometryUtils.mergeGeometries requires every input to be either
    // indexed or non-indexed, never a mix, since pins/bearings/links all
    // end up merged together in createChainGeometry.
    const geometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments).toNonIndexed();
    // CylinderGeometry's axis defaults to Y; the twist/face matrices above
    // are built around the local X axis, matching how cross-section points
    // are laid out in mobius.js.
    geometry.rotateZ(Math.PI / 2);
    geometry.applyMatrix4(matrix);
    geometry.translate(position.x, position.y, position.z);
    return geometry;
  });

  return mergeGeometries(geometries);
}

export function createPinGeometry(pinRadius, pinLength, linkCount, ringRadius, twists, radialSegments = 12) {
  const transforms = createPinTransforms(linkCount, ringRadius, twists);
  return createStationCylinderGeometry(pinRadius, pinLength, transforms, radialSegments);
}

export function createBearingGeometry(bearingRadius, bearingLength, linkCount, ringRadius, twists, radialSegments = 12) {
  const transforms = createPinTransforms(linkCount, ringRadius, twists);
  return createStationCylinderGeometry(bearingRadius, bearingLength, transforms, radialSegments);
}

function slerpTransformMatrix(m1, m2, t) {
  const q1 = new THREE.Quaternion().setFromRotationMatrix(m1);
  const q2 = new THREE.Quaternion().setFromRotationMatrix(m2);
  const q = q1.clone().slerp(q2, t);
  return new THREE.Matrix4().makeRotationFromQuaternion(q);
}

// Builds one "figure-eight" link plate spanning from one station's bearing
// to the next: a tube that wraps fully around the pin axis (radius =
// loopRadius, a true circle so it caps the round bearing) at both ends,
// matching Decision 5 in TODO-bike-chain.md ("pin, barrel, and both link
// end-loops at a given station lie in one flat plane"), and narrows toward
// the middle into a flattened ellipse -- waistRadius wide (in the bearing's
// radial direction) but only `thickness` deep (along the pin axis) -- so it
// reads as a thin plate rather than a round rod. Since the two end
// stations' frames differ (twist accumulates station to station), the
// cross-section's orientation is slerped along the link's length rather
// than held fixed -- the twist happens in the link's middle, not at its
// coplanar ends.
// axialOffset shifts the whole plate along the (interpolated) local pin
// axis, so a pair of plates can sandwich the bearing rather than
// coinciding with it.
export function createLinkGeometry(startTransform, endTransform, options) {
  const {
    loopRadius,
    waistRadius,
    thickness = waistRadius * 2,
    axialOffset = 0,
    radialSegments = 12,
    lengthSegments = 8,
  } = options;

  const rings = [];
  for (let k = 0; k <= lengthSegments; k++) {
    const s = k / lengthSegments;

    const position = startTransform.position.clone().lerp(endTransform.position, s);
    const orientation = slerpTransformMatrix(startTransform.matrix, endTransform.matrix, s);

    if (axialOffset !== 0) {
      const axialShift = new THREE.Vector3(axialOffset, 0, 0).applyMatrix4(orientation);
      position.add(axialShift);
    }

    // taper: loopRadius at both ends (s=0, s=1) in both directions (a true
    // circle, to cap the bearing); at the middle, radiusWide narrows to
    // waistRadius while radiusThin narrows further to thickness/2,
    // flattening the cross-section into an ellipse.
    const taper = Math.abs(2 * s - 1);
    const radiusWide = waistRadius + (loopRadius - waistRadius) * taper;
    const radiusThin = (thickness / 2) + (loopRadius - thickness / 2) * taper;

    const ring = [];
    for (let j = 0; j < radialSegments; j++) {
      const theta = (j / radialSegments) * 2 * Math.PI;
      const point = new THREE.Vector3(0, Math.cos(theta) * radiusWide, Math.sin(theta) * radiusThin);
      point.applyMatrix4(orientation);
      point.add(position);
      ring.push(point);
    }
    rings.push(ring);
  }

  const vertices = [];
  const uvs = [];
  for (let k = 0; k < lengthSegments; k++) {
    const ringA = rings[k];
    const ringB = rings[k + 1];
    const uA = k / lengthSegments;
    const uB = (k + 1) / lengthSegments;
    for (let j = 0; j < radialSegments; j++) {
      const a1 = ringA[j];
      const a2 = ringA[(j + 1) % radialSegments];
      const b1 = ringB[j];
      const b2 = ringB[(j + 1) % radialSegments];
      const vA1 = j / radialSegments;
      const vA2 = (j + 1) / radialSegments;
      vertices.push(
        a1.x, a1.y, a1.z,
        a2.x, a2.y, a2.z,
        b2.x, b2.y, b2.z,

        a1.x, a1.y, a1.z,
        b2.x, b2.y, b2.z,
        b1.x, b1.y, b1.z
      );
      // matches CylinderGeometry's attribute set (position/normal/uv) so
      // this geometry can be merged with pin/bearing cylinders via
      // BufferGeometryUtils.mergeGeometries.
      uvs.push(
        uA, vA1,
        uA, vA2,
        uB, vA2,

        uA, vA1,
        uB, vA2,
        uB, vA1
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// One pair of plates (per Decision 1/2: two links per pin-to-pin gap,
// alternating narrower "inner" and wider "outer" separation link-to-link)
// spanning every gap around the loop. The final gap (last station back to
// station 0) uses createClosingStationTransform instead of transforms[0]
// directly, so it spans the same per-step twist delta as every other gap
// rather than slerping across the entire accumulated twist.
export function createChainLinksGeometry(linkCount, ringRadius, twists, options) {
  const { loopRadius, waistRadius, thickness, innerSeparation, outerSeparation, radialSegments, lengthSegments } = options;
  const transforms = createPinTransforms(linkCount, ringRadius, twists);
  const closingTransform = createClosingStationTransform(linkCount, ringRadius, twists);

  const plates = [];
  for (let i = 0; i < linkCount; i++) {
    const start = transforms[i];
    const end = i === linkCount - 1 ? closingTransform : transforms[i + 1];
    const separation = i % 2 === 0 ? innerSeparation : outerSeparation;

    [separation / 2, -separation / 2].forEach(axialOffset => {
      plates.push(createLinkGeometry(start, end, {
        loopRadius, waistRadius, thickness, axialOffset, radialSegments, lengthSegments,
      }));
    });
  }

  return mergeGeometries(plates);
}

export function createChainGeometry(config) {
  const { linkCount, ringRadius, twists, pinRadius, pinLength, bearingRadius, bearingLength,
    linkWaistRadius, linkThickness, linkInnerSeparation, linkOuterSeparation, radialSegments } = config;

  const pins = createPinGeometry(pinRadius, pinLength, linkCount, ringRadius, twists, radialSegments);
  const bearings = createBearingGeometry(bearingRadius, bearingLength, linkCount, ringRadius, twists, radialSegments);
  const links = createChainLinksGeometry(linkCount, ringRadius, twists, {
    loopRadius: bearingRadius,
    waistRadius: linkWaistRadius,
    thickness: linkThickness,
    innerSeparation: linkInnerSeparation,
    outerSeparation: linkOuterSeparation,
    radialSegments,
  });

  return mergeGeometries([pins, bearings, links]);
}

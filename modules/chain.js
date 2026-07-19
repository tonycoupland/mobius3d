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

// Builds the ring-per-length-step points for one face of a link plate
// (see createLinkGeometry): a tube that wraps fully around the pin axis
// (radius = loopRadius, a true circle so it caps the round bearing) at
// both ends, matching Decision 5 in TODO-bike-chain.md ("pin, barrel, and
// both link end-loops at a given station lie in one flat plane"), and
// narrows to waistRadius in the middle. `xOffset` is an extra shift along
// the local pin axis on top of `axialOffset`, used by createLinkGeometry to
// build two parallel copies of this same outline (front/back faces) that
// are actually `thickness` apart, instead of a zero-depth sheet.
//
// The first/last `capFraction` of the length (progress `s`) is a flat
// "doughnut" landing pad: radius stays at loopRadius and orientation stays
// exactly the bearing's own, matching it flush instead of curving away
// immediately. All of the taper (loopRadius -> waistRadius -> loopRadius)
// and all of the twist (slerping from the start orientation to the end
// orientation) happens in the "connector" between the two pads. Without
// this, the taper starts at the very first step, so the surface meets the
// bearing's flat end cap at a sharp angle instead of resting flush on it --
// most visible as a dent right where each link meets its bearing when
// there are few, widely-spaced links.
function buildLinkFaceRings(startTransform, endTransform, { loopRadius, waistRadius, axialOffset, xOffset, radialSegments, lengthSegments, capFraction = 0.2 }) {
  const rings = [];
  for (let k = 0; k <= lengthSegments; k++) {
    const s = k / lengthSegments;
    const u = THREE.MathUtils.clamp((s - capFraction) / (1 - 2 * capFraction), 0, 1);

    const position = startTransform.position.clone().lerp(endTransform.position, u);
    const orientation = slerpTransformMatrix(startTransform.matrix, endTransform.matrix, u);

    const totalOffset = axialOffset + xOffset;
    if (totalOffset !== 0) {
      const axialShift = new THREE.Vector3(totalOffset, 0, 0).applyMatrix4(orientation);
      position.add(axialShift);
    }

    // linear taper within the connector: loopRadius at u=0/1 (i.e. across
    // the whole flat cap, since u is clamped there), waistRadius at u=0.5
    const radius = waistRadius + (loopRadius - waistRadius) * Math.abs(2 * u - 1);

    const ring = [];
    for (let j = 0; j < radialSegments; j++) {
      const theta = (j / radialSegments) * 2 * Math.PI;
      const point = new THREE.Vector3(0, Math.cos(theta) * radius, Math.sin(theta) * radius);
      point.applyMatrix4(orientation);
      point.add(position);
      ring.push(point);
    }
    rings.push(ring);
  }
  return rings;
}

function pushRingStrip(vertices, rings, lengthSegments, radialSegments) {
  for (let k = 0; k < lengthSegments; k++) {
    const ringA = rings[k];
    const ringB = rings[k + 1];
    for (let j = 0; j < radialSegments; j++) {
      const a1 = ringA[j];
      const a2 = ringA[(j + 1) % radialSegments];
      const b1 = ringB[j];
      const b2 = ringB[(j + 1) % radialSegments];
      vertices.push(
        a1.x, a1.y, a1.z,
        a2.x, a2.y, a2.z,
        b2.x, b2.y, b2.z,

        a1.x, a1.y, a1.z,
        b2.x, b2.y, b2.z,
        b1.x, b1.y, b1.z
      );
    }
  }
}

// Builds one "figure-eight" link plate spanning from one station's bearing
// to the next. Since the two end stations' frames differ (twist
// accumulates station to station), the cross-section's orientation is
// slerped along the link's length rather than held fixed -- the twist
// happens in the link's middle, not at its coplanar ends.
// The plate is two parallel copies of the same tapering outline (see
// buildLinkFaceRings), offset `thickness` apart along the local pin axis
// and stitched together at every step, so it's a genuine slab with depth
// rather than a zero-thickness sheet -- the outline itself (loopRadius /
// waistRadius) always lies in the plane perpendicular to the pin axis, and
// `thickness` is a separate dimension along that axis, not a distortion of
// the outline.
// axialOffset shifts the whole plate along the (interpolated) local pin
// axis, so a pair of plates can sandwich the bearing rather than
// coinciding with it.
export function createLinkGeometry(startTransform, endTransform, options) {
  const {
    loopRadius,
    waistRadius,
    thickness,
    axialOffset = 0,
    radialSegments = 12,
    lengthSegments = 8,
    capFraction = 0.2,
  } = options;

  const halfThickness = thickness / 2;
  const ringOptions = { loopRadius, waistRadius, axialOffset, radialSegments, lengthSegments, capFraction };
  const frontRings = buildLinkFaceRings(startTransform, endTransform, { ...ringOptions, xOffset: -halfThickness });
  const backRings = buildLinkFaceRings(startTransform, endTransform, { ...ringOptions, xOffset: halfThickness });

  const vertices = [];
  pushRingStrip(vertices, frontRings, lengthSegments, radialSegments);
  pushRingStrip(vertices, backRings, lengthSegments, radialSegments);

  // rim: connects the front and back rings at every step, closing the gap
  // between the two faces so the link reads as a solid slab rather than
  // two separate parallel sheets.
  for (let k = 0; k <= lengthSegments; k++) {
    const front = frontRings[k];
    const back = backRings[k];
    for (let j = 0; j < radialSegments; j++) {
      const f1 = front[j];
      const f2 = front[(j + 1) % radialSegments];
      const b1 = back[j];
      const b2 = back[(j + 1) % radialSegments];
      vertices.push(
        f1.x, f1.y, f1.z,
        f2.x, f2.y, f2.z,
        b2.x, b2.y, b2.z,

        f1.x, f1.y, f1.z,
        b2.x, b2.y, b2.z,
        b1.x, b1.y, b1.z
      );
    }
  }

  // uv is unused (no texture map is applied to this material), but needs to
  // exist and match CylinderGeometry's attribute set so this geometry can
  // be merged with pin/bearing cylinders via BufferGeometryUtils.mergeGeometries.
  const uvs = new Float32Array((vertices.length / 3) * 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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
    // Pins/bearings have a constant radius along their length, so only
    // radialSegments affects how round they look. Links taper from
    // loopRadius to waistRadius and back, so that taper is itself a curve
    // approximated by lengthSegments steps -- without tying it to the same
    // Smoothness value, the taper stays faceted no matter how round the
    // circular cross-section is.
    lengthSegments: radialSegments,
  });

  return mergeGeometries([pins, bearings, links]);
}

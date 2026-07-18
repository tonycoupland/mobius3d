import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export function createPinTransforms(linkCount, ringRadius, twists) {
  const transforms = [];
  // `twists` counts half-turns (180 degrees each) made over one lap,
  // independent of linkCount (unlike the sweep styles in mobius.js, where
  // "twist" is measured in units of the cross-section's own point count).
  // Odd values are what produce a genuine Mobius join, so a value of 1 is a
  // half twist (180 degrees) and a value of 2 is a full twist (360 degrees).
  const totalTwistRad = THREE.MathUtils.degToRad(180 * twists);

  for (let i = 0; i < linkCount; i++) {
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

    transforms.push({ index: i, position, angle, twist, matrix });
  }

  return transforms;
}

export function createPinGeometry(pinRadius, pinLength, linkCount, ringRadius, twists) {
  const transforms = createPinTransforms(linkCount, ringRadius, twists);

  const pinGeometries = transforms.map(({ position, matrix }) => {
    const geometry = new THREE.CylinderGeometry(pinRadius, pinRadius, pinLength, 12);
    // CylinderGeometry's axis defaults to Y; the twist/face matrices above
    // are built around the local X axis, matching how cross-section points
    // are laid out in mobius.js.
    geometry.rotateZ(Math.PI / 2);
    geometry.applyMatrix4(matrix);
    geometry.translate(position.x, position.y, position.z);
    return geometry;
  });

  return mergeGeometries(pinGeometries);
}

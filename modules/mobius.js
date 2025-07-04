
import * as THREE from 'three'

export function createPolygonPoints(sides, radius) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      points.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      ));
    }
    return points;
  }

  export function createPolygonPointsInRectangular(sides, radius) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      points.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      ));
    }
    // Only include the first, last and middle points
    var pointsToInclude = [];
    pointsToInclude.push(points[0]);

    if ( Math.floor(sides / 2) == sides/2 ){
      pointsToInclude.push(points[(sides/2) - 1]);
      pointsToInclude.push(points[(sides/2)]);
    }
    else {
      pointsToInclude.push(points[Math.floor(sides / 2)]);
    }

    pointsToInclude.push(points[points.length-1]);
    return pointsToInclude;
  }


  export function createRoundedPolygonPoints(n, radius, cornerRadius, segmentsPerCorner) {
    const angleStep = (Math.PI * 2) / n;
    const basePoints = [];

    // Step 1: Generate raw polygon vertices
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep;
      basePoints.push(new THREE.Vector2(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius
      ));
    }

    const finalPoints = [];

    for (let i = 0; i < n; i++) {
      const prev = basePoints[(i - 1 + n) % n];
      const curr = basePoints[i];
      const next = basePoints[(i + 1) % n];

      const v1 = prev.clone().sub(curr).normalize();  // Incoming edge
      const v2 = next.clone().sub(curr).normalize();  // Outgoing edge

      // Interior bisector
      const bisector = v1.clone().add(v2).normalize();

      // Compute angle between edges
      const angle = Math.acos(v1.dot(v2));
      const halfAngle = angle / 2;

      // Distance from corner to arc center
      const distanceToCenter = cornerRadius / Math.sin(halfAngle);

      // Arc center is in direction of bisector, inward
      const arcCenter = curr.clone().add(bisector.multiplyScalar(distanceToCenter));

      // Compute tangent points on each edge
      const tangentLength = cornerRadius / Math.tan(halfAngle);
      const startTangent = curr.clone().add(v1.multiplyScalar(tangentLength));
      const endTangent = curr.clone().add(v2.multiplyScalar(tangentLength));

      // Compute start/end angles for arc
      const startAngle = Math.atan2(startTangent.y - arcCenter.y, startTangent.x - arcCenter.x);
      const endAngle = Math.atan2(endTangent.y - arcCenter.y, endTangent.x - arcCenter.x);

      // Ensure correct CCW direction
      let deltaAngle = endAngle - startAngle;
      if (deltaAngle < 0) deltaAngle += Math.PI * 2;

      for (let j = 0; j <= segmentsPerCorner; j++) {
        const t = j / segmentsPerCorner;
        const theta = startAngle + t * deltaAngle;
        const x = arcCenter.x + cornerRadius * Math.cos(theta);
        const y = arcCenter.y + cornerRadius * Math.sin(theta);
        finalPoints.push(new THREE.Vector3(x, y, 0));
      }
    }

    return finalPoints;
  }



  export function generateGeometry(sides, polyRadius, ringRadius, segments, twists, polygonFactory) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];

    const polygons = [];

    for (let i = 0; i < segments; i++) {
      // Create polygon
      let points = polygonFactory(sides, polyRadius);

      const t = i / segments;
      const angle = t * 2 * Math.PI;
      const twistRad = THREE.MathUtils.degToRad(360 / points.length * twists);
      const twist = t * twistRad;

      // Apply twist
      const twistMatrix = new THREE.Matrix4().makeRotationZ(twist);
      points.forEach(p => p.applyMatrix4(twistMatrix));

      // Rotate polygon to face outwards
      const outAngle = angle;
      const rotY = new THREE.Matrix4().makeRotationX(Math.PI / 2);
      const rotZ = new THREE.Matrix4().makeRotationZ(outAngle);
      const faceMatrix = new THREE.Matrix4().multiply(rotZ).multiply(rotY);
      points.forEach(p => p.applyMatrix4(faceMatrix));

      // Translate outward
      const cx = Math.cos(angle) * ringRadius;
      const cy = Math.sin(angle) * ringRadius;
      const translation = new THREE.Vector3(cx, cy, 0);
      points.forEach(p => p.add(translation));

      polygons.push(points);
    }


    var fillSides = true;
    var fillPolys = false;

    if ( fillPolys){
      // Draw triangles for each poly...
      for (let i = 0; i < segments; i++) {
        var shapePoints = polygons[i];
        // Calculate center point (assumes polygon lies in XY plane)
        const center = new THREE.Vector3(0, 0, 0);
        shapePoints.forEach(p => center.add(p));
        center.divideScalar(shapePoints.length);

        // Triangulate the polygon using a fan from the center
        for (let i = 0; i < shapePoints.length; i++) {
          const a = shapePoints[i];
          const b = shapePoints[(i + 1) % shapePoints.length];

          vertices.push(
            center.x, center.y, center.z,
            a.x, a.y, a.z,
            b.x, b.y, b.z
          );
        }
      }
    }

    // Add triangles between pairs of points
    if (fillSides){
      var twisted_offset = 0;
      var pointsPerPoly = polygons[0].length;
      for (let i = 0; i < segments; i++) {
        const polyA = polygons[i];
        const polyB = polygons[(i + 1) % segments];
        if ( i == (segments-1) ) { // special case for last poly... this depends on how much it twisted
            // Need to be able to handle three scenarios...
            // rectangular
            //   we only have 3 or 4 points, the max should help
            // rounded
            //   we have lots of points per side... dividing (pointsPerPoly/sides) should get us 20
            // polygon
            //   should be 1:1, points per side
          twisted_offset = (twists);//*Math.max((pointsPerPoly), 1));
        }

        for (let j = 0; j < pointsPerPoly; j++) {
          const a1 = polyA[j];
          const a2 = polyA[(j + 1) % pointsPerPoly];
          const b1 = polyB[(j + twisted_offset) % pointsPerPoly];
          const b2 = polyB[(j + twisted_offset + 1) % pointsPerPoly];
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

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
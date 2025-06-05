import math
from typing import List, Tuple

Vertex = Tuple[float, float, float]
Triangle = List[Vertex]

class STLWriter:
    def __init__(self, name: str):
        self.name = name
        self.triangles: List[Triangle] = []

    def add_triangle(self, v1: Vertex, v2: Vertex, v3: Vertex):
        self.triangles.append([v1, v2, v3])

    def write_ascii(self, filename: str):
        with open(filename, 'w') as f:
            f.write(f"solid {self.name}\n")
            for tri in self.triangles:
                f.write("  facet normal 0.0 0.0 0.0\n")
                f.write("    outer loop\n")
                for v in tri:
                    f.write(f"      vertex {v[0]} {v[1]} {v[2]}\n")
                f.write("    endloop\n")
                f.write("  endfacet\n")
            f.write(f"endsolid {self.name}\n")
        print(f"STL file written to {filename}")

def create_polygon(radius: float, sides: int) -> List[Vertex]:
    """Create a regular 2D polygon in the XY plane centered at origin."""
    points = []
    for i in range(sides):
        angle = 2 * math.pi * i / sides
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        points.append((x, y, 0.0))
    return points



def rotate_polygon_to_face_angle(polygon: List[Vertex], angle: float) -> List[Vertex]:
    """
    Rotate polygon so that its normal (initially +Z) faces outward from ring center.
    This is done by rotating around Z so that the polygon 'turns' in the XY plane.
    """
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)

    rotated = []
    for x, y, z in polygon:
        new_x = x * cos_a - y * sin_a
        new_y = x * sin_a + y * cos_a
        new_z = z
        rotated.append((new_x, new_y, new_z))
    return rotated

def translate(vertices: List[Vertex], dx: float, dy: float, dz: float) -> List[Vertex]:
    return [(x + dx, y + dy, z + dz) for (x, y, z) in vertices]

def add_normal_arrow(writer: STLWriter, position: Vertex, direction: Vertex, length=0.5, thickness=0.05):
    px, py, pz = position
    dx, dy, dz = direction
    mag = math.sqrt(dx*dx + dy*dy + dz*dz)
    dx /= mag
    dy /= mag
    dz /= mag

    tip = (px + dx * length, py + dy * length, pz + dz * length)
    ortho = (-dy * thickness, dx * thickness, 0)
    base1 = (px + ortho[0], py + ortho[1], pz + ortho[2])
    base2 = (px - ortho[0], py - ortho[1], pz - ortho[2])
    writer.add_triangle(base1, base2, tip)

def rotate_around_axis(vertices: List[Vertex], axis: Vertex, angle_rad: float) -> List[Vertex]:
    """
    Rotate a set of vertices around a given axis (unit vector) by angle_rad.
    Uses Rodrigues' rotation formula.
    """
    ux, uy, uz = axis
    cos_theta = math.cos(angle_rad)
    sin_theta = math.sin(angle_rad)

    def rotate_vertex(v):
        x, y, z = v
        dot = ux * x + uy * y + uz * z
        cross = (
            uy * z - uz * y,
            uz * x - ux * z,
            ux * y - uy * x
        )
        rx = (x * cos_theta +
              cross[0] * sin_theta +
              ux * dot * (1 - cos_theta))
        ry = (y * cos_theta +
              cross[1] * sin_theta +
              uy * dot * (1 - cos_theta))
        rz = (z * cos_theta +
              cross[2] * sin_theta +
              uz * dot * (1 - cos_theta))
        return (rx, ry, rz)

    return [rotate_vertex(v) for v in vertices]


def create_ring_of_polygons(writer: STLWriter, sides=4, poly_radius=0.5, ring_radius=6.0, count=24, twist=1):
    base_polygon = create_polygon(poly_radius, sides)
    placed_polygons = []

    for i in range(count):
        angle = 2 * math.pi * i / count
        twist_angle = 2 * math.pi * i / count  # in radians
        cx = ring_radius * math.cos(angle)
        cy = ring_radius * math.sin(angle)

        # Step 0: Add twist rotation around X-axis before anything else
        twist_angle = 2 * math.pi * i / count * twist
        twisted = rotate_around_axis(base_polygon, (0, 0, 1), twist_angle)

        # Step 1: Rotate to face outward in XY
        rotated = rotate_polygon_to_face_angle(twisted, angle)

        # Step 2: Rotate upright (90° around outward normal)
        normal = (math.cos(angle), math.sin(angle), 0.0)
        rotated = rotate_around_axis(rotated, normal, math.radians(90))

        # Step 3: Translate to ring position
        translated = translate(rotated, cx, cy, 0.0)
        placed_polygons.append(translated)

    # Join adjacent polygons with side walls
    twisted_offset = 0
    for i in range(count):
        poly_a = placed_polygons[i]
        poly_b = placed_polygons[(i + 1) % count]
        if ( i == (count-1)): # special case for last poly... this depends on how much it twisted
            twisted_offset = 1
        for j in range(len(poly_a)):
            a1 = poly_a[j]
            a2 = poly_a[(j + 1) % len(poly_a)]
            b1 = poly_b[(j + twisted_offset) % len(poly_b)]
            b2 = poly_b[(j + 1 + twisted_offset) % len(poly_b)]
            writer.add_triangle(a1, a2, b2)
            writer.add_triangle(a1, b2, b1)

if __name__ == "__main__":
    
    sides = 3
    poly_radius = 8
    ring_radius = 30
    step_count = 360
    twist = 120

    writer = STLWriter("polygon_ring")
    create_ring_of_polygons(writer, sides=sides, poly_radius=poly_radius, ring_radius=ring_radius, count=step_count, twist=(twist/360))
    writer.write_ascii("polygon_ring_{0}_sides_{1}_twist.stl".format(sides, twist))


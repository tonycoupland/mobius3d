# mobius3d

A browser-based generator for twisted-ring / Möbius-strip-style 3D objects. Tune the shape interactively with a live [Three.js](https://threejs.org/) preview, then export an STL for 3D printing. Purely web-based — no install, no build step, no server required.

## Usage

Open [index.html](index.html) directly in a browser.

(If your browser blocks ES module imports over `file://`, serve the folder instead, e.g. `python3 -m http.server` from the project root, then visit `http://localhost:8000`.)

Adjust the controls in the side panel and the preview updates live:

- **Size** — Ring Radius and Slice Radius (in mm, used directly for the STL export).
- **Appearance** — colour, Smoothness (segments around the ring), and Polygon Corner Smoothing (for the Rounded style).
- **Shape** — Style (Polygon / Rounded Polygon / Rectangular), number of Polygon Sides, Rectangle Ratio, and Twist.

Your settings are synced to the URL, so you can bookmark or share a link to a specific shape.

Click **Download STL** to export the current shape, ready to slice and print.

## Examples

A three-sided smooth strip that twists through one side as it completes the ring (Polygon style, 3 sides, high Smoothness, Twist = 1):

![alt text](https://github.com/tonycoupland/mobius3d/blob/main/examples/3side360step.jpg?raw=true)

A six-sided low-poly strip that twists through one side as it completes the ring (Polygon style, 6 sides, low Smoothness, Twist = 1):

![alt text](https://github.com/tonycoupland/mobius3d/blob/main/examples/6side24step.jpg?raw=true)

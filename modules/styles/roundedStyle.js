import * as MOBIUS from '../mobius.js';

const CORNER_SEGMENTS = 20;

export const roundedStyle = {
  id: 'rounded',
  label: 'Rounded Polygon',
  ownedControlIds: ['sides', 'cornerSmoothing'],
  resolveSides: (config) => config.sides,
  twistScale: () => CORNER_SEGMENTS + 1,
  createPointFactory: (config) => {
    const cornerRadius = config.cornerSmoothing / 100 * config.polyRadius;
    return (sides, radius) => MOBIUS.createRoundedPolygonPoints(sides, radius, cornerRadius, CORNER_SEGMENTS);
  },
};

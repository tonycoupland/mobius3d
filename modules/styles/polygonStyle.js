import * as MOBIUS from '../mobius.js';

export const polygonStyle = {
  id: 'polygon',
  label: 'Polygon',
  ownedControlIds: ['sides'],
  resolveSides: (config) => config.sides,
  twistScale: () => 1,
  createPointFactory: () => MOBIUS.createPolygonPoints,
};

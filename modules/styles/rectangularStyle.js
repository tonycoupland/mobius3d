import * as MOBIUS from '../mobius.js';

export const rectangularStyle = {
  id: 'rectangular',
  label: 'Rectangular',
  ownedControlIds: ['ratio'],
  resolveSides: (config) => 2 * config.ratio,
  twistScale: () => 2,
  createPointFactory: () => MOBIUS.createPolygonPointsInRectangular,
};

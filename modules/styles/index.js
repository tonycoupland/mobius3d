/**
 * @typedef {Object} GeometryStyle
 * @property {string} id                - matches the <option value> / geometryType value
 * @property {string} label             - dropdown display name
 * @property {string[]} ownedControlIds - ids of #config inputs only this style uses
 *                                         (drives enable/disable and URL persistence)
 * @property {(config: object) => number} [resolveSides]
 *     - actual polygon side count to pass into MOBIUS.generateGeometry
 *       (only needed by styles using the default sweep-based buildGeometry below)
 * @property {(config: object) => number} [twistScale]
 *     - multiplier from the raw UI "twist" value to generateGeometry's twist units
 *       (must match the point-count-per-side the factory below produces, so the
 *       closing-seam offset in generateGeometry lines up)
 * @property {(config: object) => (sides: number, radius: number) => import('three').Vector3[]} [createPointFactory]
 *     - returns the cross-section point factory, closing over any style-specific
 *       params pulled from config (e.g. corner radius)
 * @property {(config: object) => import('three').BufferGeometry} [buildGeometry]
 *     - builds the style's geometry directly. Styles that omit this use the
 *       default sweep-based path (resolveSides + twistScale + createPointFactory
 *       fed into MOBIUS.generateGeometry); styles whose construction doesn't fit
 *       that pipeline (e.g. the chain style) provide their own.
 */

import { polygonStyle } from './polygonStyle.js';
import { roundedStyle } from './roundedStyle.js';
import { rectangularStyle } from './rectangularStyle.js';
import { chainStyle } from './chainStyle.js';

export const STYLES = [polygonStyle, roundedStyle, rectangularStyle, chainStyle];

export function getStyle(id) {
  const style = STYLES.find(s => s.id === id);
  if (!style) throw new Error(`Unknown geometry style: ${id}`);
  return style;
}

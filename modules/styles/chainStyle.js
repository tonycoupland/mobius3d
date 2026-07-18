import * as CHAIN from '../chain.js';

// Pin radius is derived from the existing "Slice Radius" control (the same
// knob the other styles use to size their cross-section); everything else
// chain-specific has its own dedicated control. A dedicated pinRadius
// control can replace this ratio later if radius needs to be tuned
// independently too.
const PIN_RADIUS_RATIO = 0.25;

export const chainStyle = {
  id: 'chain',
  label: 'Bike Chain',
  ownedControlIds: [
    'linkCount', 'pinLength', 'bearingRadius', 'bearingLength',
    'linkWaistRadius', 'linkInnerSeparation', 'linkOuterSeparation',
  ],
  irrelevantCommonControlIds: ['segments'],
  buildGeometry: (config) => CHAIN.createChainGeometry({
    linkCount: config.linkCount,
    ringRadius: config.ringRadius,
    twists: config.twist,
    pinRadius: config.polyRadius * PIN_RADIUS_RATIO,
    pinLength: config.pinLength,
    bearingRadius: config.bearingRadius,
    bearingLength: config.bearingLength,
    linkWaistRadius: config.linkWaistRadius,
    linkInnerSeparation: config.linkInnerSeparation,
    linkOuterSeparation: config.linkOuterSeparation,
  }),
};

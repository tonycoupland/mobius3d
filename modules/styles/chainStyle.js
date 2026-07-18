import * as CHAIN from '../chain.js';

// Phase 1 (pins only): pin radius is derived from the existing "Slice
// Radius" control (the same knob the other styles use to size their
// cross-section); pin length has its own dedicated control since it's not
// meaningfully related to radius. A dedicated pinRadius control can replace
// this ratio in a later phase if radius needs to be tuned independently too.
const PIN_RADIUS_RATIO = 0.25;

export const chainStyle = {
  id: 'chain',
  label: 'Bike Chain',
  ownedControlIds: ['linkCount', 'pinLength'],
  irrelevantCommonControlIds: ['segments'],
  buildGeometry: (config) => CHAIN.createPinGeometry(
    config.polyRadius * PIN_RADIUS_RATIO,
    config.pinLength,
    config.linkCount,
    config.ringRadius,
    config.twist
  ),
};

/**
 * Halo State Management Plugin - Index
 *
 * Exports the complete Halo State Management system
 */

export {
  HaloStatePlugin,
  createHaloStatePlugin,
  type HaloStateConfig,
  type HaloState,
  type StateEvent,
  type StateCheckpoint,
  type FieldDefinition,
  type UIFieldDefinition,
  type ValidationRule,
  type StateEventType,
} from './HaloStatePlugin';

// Browser-compatible version
export {
  HaloStatePlugin as HaloStatePluginBrowser,
  createHaloStatePlugin as createHaloStatePluginBrowser,
} from './HaloStatePlugin.browser';

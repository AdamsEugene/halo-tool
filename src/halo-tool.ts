// Universal export - works in both browser and Node.js
import { createHaloToolPlugin, HaloToolPlugin } from './plugin';

// Create the default instance
const HaloTool = createHaloToolPlugin({
  namespace: 'HaloTool',
  globalAccess: typeof window !== 'undefined', // Only global in browser
  autoInit: true,
  enableMetrics: true,
  enableTracing: typeof window === 'undefined', // Enable tracing in Node.js
  enableErrorTracking: true,
  enableStateManagement: true,
});

// Export everything
export { HaloTool, HaloToolPlugin, createHaloToolPlugin };

// Export plugin components for advanced usage
export * from './plugin';

// Export core system for direct access
export * from './core/interfaces';
export * from './core/types';
export * from './executors';
export * from './resilience';
export * from './processors';
export * from './http';
export * from './state';
export * from './telemetry';
export * from './utils';

// Default export
export default HaloTool;

// Global declaration for TypeScript
declare global {
  interface Window {
    HaloTool: typeof HaloTool;
  }
}

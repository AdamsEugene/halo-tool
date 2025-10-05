// Node.js initialization script
// This script provides a Node.js-friendly initialization

import { createHaloToolPlugin } from './HaloToolPlugin';

// Create a Node.js optimized instance
export const HaloTool = createHaloToolPlugin({
  namespace: 'HaloTool',
  globalAccess: false, // Don't pollute global namespace in Node.js by default
  autoInit: true,
  enableMetrics: true,
  enableTracing: true,
  enableErrorTracking: true,
  enableStateManagement: true,
});

// Export for CommonJS compatibility
module.exports = HaloTool;
module.exports.HaloTool = HaloTool;
module.exports.createHaloToolPlugin = createHaloToolPlugin;

export default HaloTool;

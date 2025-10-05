// Browser entry point for HaloTool
import { createHaloToolPlugin } from './plugin/HaloToolPlugin';

// Create the default plugin instance
const haloToolPlugin = createHaloToolPlugin({
  namespace: 'HaloTool',
  globalAccess: true,
  autoInit: false, // Don't auto-init, let the user control initialization
  enableMetrics: true,
  enableTracing: false,
  enableErrorTracking: true,
  enableStateManagement: true,
});

// Export for UMD
export default haloToolPlugin;
export { haloToolPlugin, createHaloToolPlugin };

// Make available globally in browser
if (typeof window !== 'undefined') {
  (window as any).HaloTool = haloToolPlugin;
}

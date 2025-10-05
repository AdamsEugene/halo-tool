// Browser initialization script
// This script automatically initializes HaloTool when loaded in a browser

import { haloToolPlugin } from './HaloToolPlugin';

// Auto-initialize when in browser environment
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeHaloTool();
    });
  } else {
    initializeHaloTool();
  }
}

function initializeHaloTool() {
  // Initialize the plugin with browser-friendly defaults
  haloToolPlugin
    .init({
      namespace: 'HaloTool',
      globalAccess: true,
      autoInit: true,
      enableMetrics: true,
      enableErrorTracking: true,
      enableStateManagement: true,
      enableTracing: false, // Disable tracing in browser by default
    })
    .then(() => {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log('🔧 HaloTool initialized and ready!');
        // eslint-disable-next-line no-console
        console.log('Usage: HaloTool.get("https://api.example.com/data")');
        // eslint-disable-next-line no-console
        console.log('       HaloTool.state.set({ user: "John" })');
        // eslint-disable-next-line no-console
        console.log('       HaloTool.workflow(["tool1", "tool2"])');
      }
    })
    .catch(error => {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.error('❌ HaloTool initialization failed:', error);
      }
    });
}

export { haloToolPlugin as default };

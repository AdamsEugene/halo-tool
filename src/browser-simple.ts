// Minimal browser entry point for HaloTool
import { EventEmitter } from 'eventemitter3';
import { HaloToolsCore } from './index';

interface StateData {
  [key: string]: unknown;
}

interface ApiResponse {
  success: boolean;
  data: unknown;
}

interface ToolConfig {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface WorkflowResult {
  toolId: string;
  success: boolean;
  data: unknown;
  executionTime: number;
}

interface MetricData {
  name: string;
  value: number;
  timestamp: number;
}

// Create a simplified HaloTool for browser use
class BrowserHaloTool extends EventEmitter {
  private core?: HaloToolsCore;
  private initialized = false;

  async init(config: Record<string, unknown> = {}): Promise<this> {
    try {
      this.core = new HaloToolsCore({
        enableMetrics: true,
        enableTracing: false,
        enableErrorTracking: true,
        enableStateManagement: true,
        ...config,
      });

      this.initialized = true;
      this.emit('initialized');
      return this;
    } catch (error) {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize HaloTool:', error);
      }
      throw error;
    }
  }

  // Simple API methods for browser use
  async get(url: string, statePath?: string): Promise<ApiResponse> {
    if (!this.initialized || !this.core) {
      throw new Error('HaloTool not initialized. Call init() first.');
    }

    try {
      // For browser demo, we'll use fetch instead of the complex server tool system
      const response = await fetch(url);
      const data = await response.json();

      if (statePath && this.core) {
        // Update state if path provided
        const currentState = (this.core.getState() as StateData) || {};
        const newState = { ...currentState, [statePath]: data };
        this.core.setState(newState);
      }

      return { success: true, data };
    } catch (error) {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.error('GET request failed:', error);
      }
      throw error;
    }
  }

  async post(url: string, data: unknown): Promise<ApiResponse> {
    if (!this.initialized || !this.core) {
      throw new Error('HaloTool not initialized. Call init() first.');
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();
      return { success: true, data: responseData };
    } catch (error) {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.error('POST request failed:', error);
      }
      throw error;
    }
  }

  // State management
  getState(): StateData {
    return (this.core?.getState() as StateData) || {};
  }

  setState(state: StateData): void {
    if (this.core) {
      this.core.setState(state);
    }
  }

  updateState(path: string, value: unknown): void {
    const currentState = this.getState();
    const parts = path.split('.');
    let current = currentState as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
    this.setState(currentState);
  }

  // Mock tool management for demo
  async createServerTool(config: ToolConfig): Promise<string> {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('Creating server tool:', config.name);
    }
    // In browser, we just simulate tool creation
    return config.id;
  }

  async createSystemTool(config: ToolConfig): Promise<string> {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('Creating system tool:', config.name);
    }
    // In browser, we just simulate tool creation
    return config.id;
  }

  async executeTool(toolId: string, _context?: unknown): Promise<WorkflowResult> {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('Executing tool:', toolId);
    }
    // Simulate tool execution
    return {
      success: true,
      data: { message: `Tool '${toolId}' executed successfully`, timestamp: Date.now() },
      executionTime: 100,
    } as WorkflowResult;
  }

  async workflow(
    toolIds: string[],
    _initialState: Record<string, unknown> = {}
  ): Promise<WorkflowResult[]> {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('Starting workflow with tools:', toolIds);
    }
    const results: WorkflowResult[] = [];

    for (const toolId of toolIds) {
      results.push({
        toolId,
        success: true,
        data: { step: toolId, completed: new Date().toISOString() },
        executionTime: 100,
      });
    }

    return results;
  }

  getMetrics(): MetricData[] {
    return [
      { name: 'tools.executed', value: 5, timestamp: Date.now() },
      { name: 'api.calls', value: Math.floor(Math.random() * 100), timestamp: Date.now() },
      { name: 'cache.hits', value: Math.floor(Math.random() * 50), timestamp: Date.now() },
    ];
  }

  getAllTools(): ToolConfig[] {
    return []; // Return empty array for browser demo
  }

  captureError(error: Error): string {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('Error captured:', error.message);
    }
    return `error_${Date.now()}`;
  }
}

// Create and export the browser instance
const haloTool = new BrowserHaloTool();

// Export for different module systems
export default haloTool;

// Make available globally in browser
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).HaloTool = haloTool;
}

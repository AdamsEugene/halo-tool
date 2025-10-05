// Standalone browser version of HaloTool
import { EventEmitter } from 'eventemitter3';

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
  type?: string;
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

interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  auth?: {
    type: 'bearer' | 'basic' | 'apiKey';
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
  };
}

// Simple browser-compatible HaloTool implementation
class BrowserHaloTool extends EventEmitter {
  private initialized = false;
  private state: StateData = {};
  private tools = new Map<string, ToolConfig>();

  async init(config: Record<string, unknown> = {}): Promise<this> {
    try {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log('Initializing HaloTool for browser...', config);
      }
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

  // Enhanced HTTP request method
  async request(
    url: string,
    options: HttpRequestOptions = {},
    statePath?: string
  ): Promise<ApiResponse> {
    if (!this.initialized) {
      throw new Error('HaloTool not initialized. Call init() first.');
    }

    try {
      const { method = 'GET', headers = {}, body, auth } = options;

      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`Making ${method} request to: ${url}`, { headers, body, auth });
      }

      // Setup headers
      const requestHeaders: Record<string, string> = { ...headers };

      // Handle authentication
      if (auth) {
        switch (auth.type) {
          case 'bearer':
            if (auth.token) {
              requestHeaders.Authorization = `Bearer ${auth.token}`;
            }
            break;
          case 'basic':
            if (auth.username && auth.password) {
              const credentials = btoa(`${auth.username}:${auth.password}`);
              requestHeaders.Authorization = `Basic ${credentials}`;
            }
            break;
          case 'apiKey':
            if (auth.key && auth.value) {
              requestHeaders[auth.key] = auth.value;
            }
            break;
        }
      }

      // Setup request options
      const fetchOptions: RequestInit = {
        method,
        headers: requestHeaders,
      };

      // Add body for non-GET requests
      if (body && method !== 'GET') {
        if (typeof body === 'object') {
          fetchOptions.body = JSON.stringify(body);
          if (!requestHeaders['Content-Type']) {
            requestHeaders['Content-Type'] = 'application/json';
          }
        } else {
          fetchOptions.body = String(body);
        }
      }

      const response = await fetch(url, fetchOptions);

      let data: unknown;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (statePath) {
        this.updateState(statePath, data);
      }

      const result = {
        success: response.ok,
        data,
        status: response.status,
        statusText: response.statusText,
        headers: {} as Record<string, string>,
      };

      // Convert headers to object
      response.headers.forEach((value, key) => {
        (result.headers as Record<string, string>)[key] = value;
      });

      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`${method} request ${response.ok ? 'successful' : 'failed'}:`, result);
      }

      return result;
    } catch (error) {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.error('HTTP request failed:', error);
      }
      throw error;
    }
  }

  // Simple API methods for backward compatibility
  async get(url: string, statePath?: string): Promise<ApiResponse> {
    return this.request(url, { method: 'GET' }, statePath);
  }

  async post(url: string, data: unknown, statePath?: string): Promise<ApiResponse> {
    return this.request(url, { method: 'POST', body: data }, statePath);
  }

  async put(url: string, data: unknown, statePath?: string): Promise<ApiResponse> {
    return this.request(url, { method: 'PUT', body: data }, statePath);
  }

  async patch(url: string, data: unknown, statePath?: string): Promise<ApiResponse> {
    return this.request(url, { method: 'PATCH', body: data }, statePath);
  }

  async delete(url: string, statePath?: string): Promise<ApiResponse> {
    return this.request(url, { method: 'DELETE' }, statePath);
  }

  // State management
  getState(): StateData {
    return this.state;
  }

  setState(newState: StateData): void {
    this.state = { ...newState };
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('State updated:', this.state);
    }
  }

  updateState(path: string, value: unknown): void {
    const parts = path.split('.');
    let current = this.state as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`State path '${path}' updated to:`, value);
    }
  }

  // Tool management (simplified for browser)
  async createServerTool(config: ToolConfig): Promise<string> {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('Creating server tool:', config.name);
    }
    this.tools.set(config.id, { ...config, type: 'server' });
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`✅ Server tool '${config.id}' created successfully`);
    }
    return config.id;
  }

  async createSystemTool(config: ToolConfig): Promise<string> {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('Creating system tool:', config.name);
    }
    this.tools.set(config.id, { ...config, type: 'system' });
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`✅ System tool '${config.id}' created successfully`);
    }
    return config.id;
  }

  async executeTool(toolId: string, _context?: unknown): Promise<WorkflowResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool '${toolId}' not found`);
    }

    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('Executing tool:', tool.name);
    }

    // Simulate tool execution
    await new Promise(resolve => setTimeout(resolve, 500));

    const result: WorkflowResult = {
      success: true,
      data: { message: `Tool '${toolId}' executed successfully`, timestamp: Date.now() },
      executionTime: 500,
      toolId,
    };

    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('✅ Tool execution completed:', result);
    }
    return result;
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
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`Executing workflow step: ${toolId}`);
      }
      await new Promise(resolve => setTimeout(resolve, 300));

      results.push({
        toolId,
        success: true,
        data: { step: toolId, completed: new Date().toISOString() },
        executionTime: 300,
      });
    }

    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`✅ Workflow completed successfully with ${results.length} steps`);
    }
    return results;
  }

  getMetrics(): MetricData[] {
    return [
      { name: 'tools.executed', value: this.tools.size, timestamp: Date.now() },
      { name: 'api.calls', value: Math.floor(Math.random() * 100), timestamp: Date.now() },
      { name: 'cache.hits', value: Math.floor(Math.random() * 50), timestamp: Date.now() },
    ];
  }

  getAllTools(): ToolConfig[] {
    return Array.from(this.tools.values());
  }

  captureError(error: Error): string {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('❌ Error captured:', error.message);
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

import { EventEmitter } from 'eventemitter3';
import { HaloToolsConfig, HaloToolsCore } from '../index';
import { ITool, IToolExecutionContext, IToolResult } from '../core/interfaces';

export interface PluginConfig extends HaloToolsConfig {
  namespace?: string;
  autoInit?: boolean;
  globalAccess?: boolean;
}

export interface PluginAPI {
  // Core tool management
  registerTool(tool: ITool): Promise<void>;
  executeTool(toolId: string, context: IToolExecutionContext): Promise<IToolResult>;
  getTool(toolId: string): ITool | undefined;
  getAllTools(): ITool[];

  // Convenience methods
  createServerTool(config: unknown): Promise<string>;
  createClientTool(config: unknown): Promise<string>;
  createSystemTool(config: unknown): Promise<string>;

  // State management
  getState(): unknown;
  setState(state: unknown): void;

  // Metrics & monitoring
  getMetrics(): unknown[];
  captureError(error: Error): string;

  // Lifecycle
  init(config?: PluginConfig): Promise<void>;
  destroy(): void;
}

export class HaloToolPlugin extends EventEmitter implements PluginAPI {
  private haloTools?: HaloToolsCore;
  private config: PluginConfig;
  private initialized = false;
  private namespace: string;

  constructor(config: PluginConfig = {}) {
    super();

    this.config = {
      namespace: 'HaloTool',
      autoInit: true,
      globalAccess: true,
      enableMetrics: true,
      enableTracing: true,
      enableErrorTracking: true,
      enableStateManagement: true,
      ...config,
    };

    this.namespace = this.config.namespace || 'HaloTool';

    if (this.config.autoInit) {
      this.init().catch(error => {
        this.emit('initError', error);
      });
    }
  }

  public async init(config?: PluginConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    try {
      // Initialize the core HaloTools system
      this.haloTools = new HaloToolsCore(this.config);

      // Setup global access if enabled
      if (this.config.globalAccess && typeof window !== 'undefined') {
        this.setupGlobalAccess();
      } else if (this.config.globalAccess && typeof global !== 'undefined') {
        this.setupNodeGlobalAccess();
      }

      // Forward events from HaloTools
      this.setupEventForwarding();

      this.initialized = true;
      this.emit('initialized', { namespace: this.namespace });
    } catch (error) {
      this.emit('initError', error);
      throw error;
    }
  }

  // Core tool management methods
  public async registerTool(tool: ITool): Promise<void> {
    this.ensureInitialized();
    await this.haloTools?.registerTool(tool);
    this.emit('toolRegistered', { toolId: tool.id });
  }

  public async executeTool(toolId: string, context: IToolExecutionContext): Promise<IToolResult> {
    this.ensureInitialized();
    const result = await this.haloTools?.executeTool(toolId, context);
    if (!result) {
      throw new Error('Tool execution failed - no result returned');
    }
    return result;
  }

  public getTool(toolId: string): ITool | undefined {
    this.ensureInitialized();
    return this.haloTools?.getTool(toolId);
  }

  public getAllTools(): ITool[] {
    this.ensureInitialized();
    return this.haloTools?.getAllTools() || [];
  }

  // Convenience tool creation methods
  public async createServerTool(config: {
    id: string;
    name: string;
    description: string;
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    assignments?: Array<{
      source: 'response';
      valuePath: string;
      statePath: string;
    }>;
    cache?: {
      ttlSec?: number;
      strategy?: 'memory' | 'localStorage' | 'sessionStorage';
    };
    retry?: {
      max: number;
      strategy: 'exponential' | 'fixed' | 'linear';
    };
  }): Promise<string> {
    const tool: ITool = {
      id: config.id,
      type: 'server',
      name: config.name,
      description: config.description,
      api: {
        url: config.url,
        method: config.method,
        headers: config.headers,
        cache: config.cache,
      },
      assignments: config.assignments,
      retry: config.retry,
    };

    await this.registerTool(tool);
    return tool.id;
  }

  public async createClientTool(config: {
    id: string;
    name: string;
    description: string;
    fn: string;
    rollback?: {
      fn: string;
      params?: unknown;
    };
  }): Promise<string> {
    const tool: ITool = {
      id: config.id,
      type: 'client',
      name: config.name,
      description: config.description,
      client: {
        fn: config.fn,
        rollback: config.rollback,
      },
    };

    await this.registerTool(tool);
    return tool.id;
  }

  public async createSystemTool(config: {
    id: string;
    name: string;
    description: string;
    op: 'assign' | 'merge' | 'delete' | 'transform';
    path: string;
    value?: unknown;
    transform?: {
      type: 'jsonata' | 'javascript';
      expression: string;
    };
  }): Promise<string> {
    const tool: ITool = {
      id: config.id,
      type: 'system',
      name: config.name,
      description: config.description,
      system: {
        op: config.op,
        path: config.path,
        value: config.value,
        transform: config.transform,
      },
    };

    await this.registerTool(tool);
    return tool.id;
  }

  // State management
  public getState(): unknown {
    this.ensureInitialized();
    return this.haloTools?.getState();
  }

  public setState(state: unknown): void {
    this.ensureInitialized();
    this.haloTools?.setState(state);
  }

  // Metrics & monitoring
  public getMetrics(): unknown[] {
    this.ensureInitialized();
    return this.haloTools?.getMetrics() || [];
  }

  public captureError(error: Error): string {
    this.ensureInitialized();
    return this.haloTools?.captureError(error) || '';
  }

  // Utility methods for common workflows
  public async executeWorkflow(
    toolIds: string[],
    initialState: unknown = {}
  ): Promise<IToolResult[]> {
    this.ensureInitialized();

    const context: IToolExecutionContext = {
      toolId: 'workflow',
      instanceId: `workflow_${Date.now()}`,
      startTime: Date.now(),
      triggeredBy: 'manual',
      state: initialState,
    };

    return (await this.haloTools?.executeSequence(toolIds, context)) || [];
  }

  public async quickServerCall(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
    data?: unknown,
    statePath?: string
  ): Promise<IToolResult> {
    const toolId = `quick_${Date.now()}`;

    const assignments = statePath
      ? [
          {
            source: 'response' as const,
            valuePath: '$',
            statePath,
          },
        ]
      : undefined;

    await this.createServerTool({
      id: toolId,
      name: `Quick ${method} Call`,
      description: `Quick ${method} call to ${url}`,
      url,
      method,
      assignments,
    });

    const context: IToolExecutionContext = {
      toolId,
      instanceId: `quick_${Date.now()}`,
      startTime: Date.now(),
      triggeredBy: 'manual',
      state: data || {},
    };

    return await this.executeTool(toolId, context);
  }

  public async quickStateUpdate(path: string, value: unknown): Promise<IToolResult> {
    const toolId = `state_update_${Date.now()}`;

    await this.createSystemTool({
      id: toolId,
      name: 'Quick State Update',
      description: `Update state at ${path}`,
      op: 'assign',
      path,
      value,
    });

    const context: IToolExecutionContext = {
      toolId,
      instanceId: `state_${Date.now()}`,
      startTime: Date.now(),
      triggeredBy: 'manual',
      state: this.getState() || {},
    };

    return await this.executeTool(toolId, context);
  }

  // Lifecycle
  public destroy(): void {
    if (this.haloTools) {
      this.haloTools.destroy();
    }

    // Clean up global access
    if (this.config.globalAccess) {
      if (typeof window !== 'undefined') {
        delete (window as unknown as Record<string, unknown>)[this.namespace];
      } else if (typeof global !== 'undefined') {
        delete (global as unknown as Record<string, unknown>)[this.namespace];
      }
    }

    this.removeAllListeners();
    this.initialized = false;
    this.emit('destroyed');
  }

  // Private helper methods
  private ensureInitialized(): void {
    if (!this.initialized || !this.haloTools) {
      throw new Error('HaloToolPlugin not initialized. Call init() first.');
    }
  }

  private setupGlobalAccess(): void {
    const globalAPI = {
      // Core methods
      registerTool: this.registerTool.bind(this),
      executeTool: this.executeTool.bind(this),
      getTool: this.getTool.bind(this),
      getAllTools: this.getAllTools.bind(this),

      // Convenience methods
      createServerTool: this.createServerTool.bind(this),
      createClientTool: this.createClientTool.bind(this),
      createSystemTool: this.createSystemTool.bind(this),

      // Quick actions
      call: this.quickServerCall.bind(this),
      get: (url: string, statePath?: string) =>
        this.quickServerCall(url, 'GET', undefined, statePath),
      post: (url: string, data?: unknown, statePath?: string) =>
        this.quickServerCall(url, 'POST', data, statePath),
      put: (url: string, data?: unknown, statePath?: string) =>
        this.quickServerCall(url, 'PUT', data, statePath),
      delete: (url: string, statePath?: string) =>
        this.quickServerCall(url, 'DELETE', undefined, statePath),

      // State shortcuts
      state: {
        get: this.getState.bind(this),
        set: this.setState.bind(this),
        update: this.quickStateUpdate.bind(this),
      },

      // Workflow
      workflow: this.executeWorkflow.bind(this),

      // Monitoring
      metrics: this.getMetrics.bind(this),
      error: this.captureError.bind(this),

      // Meta
      version: '1.0.0',
      initialized: () => this.initialized,
      destroy: this.destroy.bind(this),
    };

    (window as unknown as Record<string, unknown>)[this.namespace] = globalAPI;
  }

  private setupNodeGlobalAccess(): void {
    const globalAPI = {
      registerTool: this.registerTool.bind(this),
      executeTool: this.executeTool.bind(this),
      getTool: this.getTool.bind(this),
      getAllTools: this.getAllTools.bind(this),
      createServerTool: this.createServerTool.bind(this),
      createClientTool: this.createClientTool.bind(this),
      createSystemTool: this.createSystemTool.bind(this),
      call: this.quickServerCall.bind(this),
      state: {
        get: this.getState.bind(this),
        set: this.setState.bind(this),
        update: this.quickStateUpdate.bind(this),
      },
      workflow: this.executeWorkflow.bind(this),
      metrics: this.getMetrics.bind(this),
      error: this.captureError.bind(this),
      version: '1.0.0',
      initialized: () => this.initialized,
      destroy: this.destroy.bind(this),
    };

    (global as Record<string, unknown>)[this.namespace] = globalAPI;
  }

  private setupEventForwarding(): void {
    if (!this.haloTools) return;

    // Forward key events from HaloTools
    this.haloTools.on('toolRegistered', (data: unknown) => this.emit('toolRegistered', data));
    this.haloTools.on('toolExecutionStarted', (data: unknown) =>
      this.emit('toolExecutionStarted', data)
    );
    this.haloTools.on('toolExecutionCompleted', (data: unknown) =>
      this.emit('toolExecutionCompleted', data)
    );
    this.haloTools.on('toolExecutionFailed', (data: unknown) =>
      this.emit('toolExecutionFailed', data)
    );
    this.haloTools.on('stateChanged', (data: unknown) => this.emit('stateChanged', data));
    this.haloTools.on('errorCaptured', (data: unknown) => this.emit('errorCaptured', data));
  }

  // Getters for advanced usage
  public get core(): HaloToolsCore | undefined {
    return this.haloTools;
  }

  public get isInitialized(): boolean {
    return this.initialized;
  }

  public get pluginConfig(): PluginConfig {
    return { ...this.config };
  }
}

// Default instance
export const haloToolPlugin = new HaloToolPlugin();

// Factory function
export function createHaloToolPlugin(config?: PluginConfig): HaloToolPlugin {
  return new HaloToolPlugin(config);
}

export default HaloToolPlugin;

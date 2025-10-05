import { EventEmitter } from 'eventemitter3';

// Core exports
export * from './core/interfaces';
export {
  JSONSchema,
  ToolType,
  TriggerType,
  HTTPMethod,
  RetryStrategy,
  ErrorHandlingStrategy,
  CacheStrategy,
  RateLimitStrategy,
  ToolExecutionState,
  StateOperation,
  TransformType,
  ToolMetadata,
  ToolExecutionOptions,
  ValidationResult,
  ValidationError,
} from './core/types';
export * from './core/base';
export * from './core/registry';
export * from './core/events';

// Executors
export * from './executors';

// Resilience features
export * from './resilience';

// Processors
export * from './processors';

// HTTP client and auth
export * from './http';

// State management
export * from './state';

// Telemetry
export * from './telemetry';

// Utils
export * from './utils';

// Export the plugin as the main interface
export { HaloToolPlugin, createHaloToolPlugin, haloToolPlugin } from './plugin';

// Main Halo Tools class
import { ToolLoader, ToolRegistry } from './core/registry';
import { EventBus } from './core/events';
import { ToolOrchestrator } from './executors';
import { StateManager, StateStore } from './state';
import { ErrorTracker, MetricsCollector, TracingManager } from './telemetry';
import { ITool, IToolExecutionContext, IToolResult } from './core/interfaces';

export interface HaloToolsConfig {
  enableMetrics?: boolean;
  enableTracing?: boolean;
  enableErrorTracking?: boolean;
  enableStateManagement?: boolean;
  maxTools?: number;
  retentionPeriod?: number;
}

export class HaloToolsCore extends EventEmitter {
  private registry: ToolRegistry;
  private loader: ToolLoader;
  private eventBus: EventBus;
  private orchestrator: ToolOrchestrator;
  private stateManager?: StateManager;
  private stateStore?: StateStore;
  private metricsCollector?: MetricsCollector;
  private tracingManager?: TracingManager;
  private errorTracker?: ErrorTracker;
  private config: HaloToolsConfig;

  constructor(config: HaloToolsConfig = {}) {
    super();

    this.config = {
      enableMetrics: true,
      enableTracing: false,
      enableErrorTracking: true,
      enableStateManagement: true,
      maxTools: 1000,
      retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      ...config,
    };

    // Initialize core components
    this.registry = new ToolRegistry();
    this.loader = new ToolLoader(this.registry);
    this.eventBus = EventBus.getInstance();
    this.orchestrator = new ToolOrchestrator(this.registry);

    // Initialize optional components
    if (this.config.enableStateManagement) {
      this.stateStore = new StateStore();
      this.stateManager = new StateManager(this.stateStore);
    }

    if (this.config.enableMetrics) {
      this.metricsCollector = new MetricsCollector();
    }

    if (this.config.enableTracing) {
      this.tracingManager = new TracingManager();
    }

    if (this.config.enableErrorTracking) {
      this.errorTracker = new ErrorTracker();
    }

    this.setupEventListeners();
  }

  // Tool Management
  public async registerTool(tool: ITool): Promise<void> {
    return this.registry.register(tool);
  }

  public unregisterTool(toolId: string): void {
    this.registry.unregister(toolId);
  }

  public getTool(toolId: string): ITool | undefined {
    return this.registry.get(toolId);
  }

  public getAllTools(): ITool[] {
    return this.registry.getAll();
  }

  public async loadToolsFromPath(path: string): Promise<ITool[]> {
    return this.loader.loadFromDirectory(path);
  }

  // Tool Execution
  public async executeTool(toolId: string, context: IToolExecutionContext): Promise<IToolResult> {
    return this.orchestrator.executeTool(toolId, context);
  }

  public async executeSequence(
    toolIds: string[],
    context: IToolExecutionContext
  ): Promise<IToolResult[]> {
    return this.orchestrator.executeSequence(toolIds, context);
  }

  public async executeParallel(
    toolIds: string[],
    context: IToolExecutionContext
  ): Promise<IToolResult[]> {
    return this.orchestrator.executeParallel(toolIds, context);
  }

  // State Management
  public getState(): unknown {
    return this.stateManager?.getState();
  }

  public setState(state: unknown): void {
    this.stateManager?.setState(state);
  }

  public subscribeToState(
    path: string,
    callback: (value: unknown, previousValue: unknown) => void,
    options?: { immediate?: boolean; deep?: boolean }
  ): (() => void) | undefined {
    return this.stateManager?.subscribeToPath(path, callback, options);
  }

  // Metrics
  public getMetrics(name?: string): unknown[] {
    return this.metricsCollector?.getMetrics(name) || [];
  }

  // Tracing
  public startTrace(
    operationName: string,
    parentSpanId?: string,
    tags?: Record<string, unknown>
  ): unknown {
    return this.tracingManager?.startSpan(operationName, parentSpanId, tags);
  }

  public traceOperation<T>(
    operationName: string,
    operation: (span: unknown) => T,
    parentSpanId?: string,
    tags?: Record<string, unknown>
  ): T {
    const span = this.startTrace(operationName, parentSpanId, tags);
    try {
      const result = operation(span);
      return result;
    } finally {
      // End span logic would go here
    }
  }

  // Error Tracking
  public captureError(
    error: Error,
    context?: Record<string, unknown>,
    tags?: Record<string, string>,
    severity?: 'low' | 'medium' | 'high' | 'critical'
  ): string {
    return this.errorTracker?.captureError(error, context, tags, severity) || '';
  }

  public captureMessage(
    message: string,
    level?: 'info' | 'warning' | 'error',
    context?: Record<string, unknown>
  ): string {
    return this.errorTracker?.captureMessage(message, level, context) || '';
  }

  // System Stats
  public getSystemStats(): {
    tools: {
      total: number;
      byType: Record<string, number>;
    };
    state?: {
      subscriptions: number;
      checkpoints: number;
    };
    metrics?: {
      totalMetrics: number;
      uniqueNames: number;
    };
    tracing?: {
      totalTraces: number;
      activeSpans: number;
    };
    errors?: {
      totalErrors: number;
      errorRate: number;
    };
  } {
    const tools = this.registry.getAll();
    const toolsByType = tools.reduce(
      (acc: Record<string, number>, tool: ITool) => {
        acc[tool.type] = (acc[tool.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const stats = {
      tools: {
        total: tools.length,
        byType: toolsByType,
      },
    };

    return stats as any;
  }

  // Export/Import
  public exportData(): {
    tools: ITool[];
    state?: unknown;
    metrics?: unknown;
    traces?: unknown;
    errors?: unknown;
    metadata: {
      exportTime: number;
      version: string;
      config: HaloToolsConfig;
    };
  } {
    const exportData = {
      tools: this.getAllTools(),
      metadata: {
        exportTime: Date.now(),
        version: '1.0.0',
        config: this.config,
      },
    };

    return exportData as any;
  }

  public importData(data: {
    tools?: ITool[];
    state?: unknown;
    metrics?: unknown;
    traces?: unknown;
    errors?: unknown;
  }): void {
    if (data.tools) {
      data.tools.forEach(tool => {
        this.registerTool(tool);
      });
    }

    if (data.state && this.stateManager) {
      this.stateManager.importState(data.state as { state: unknown });
    }
  }

  // Lifecycle
  public destroy(): void {
    this.registry.clear();
    this.removeAllListeners();
    this.emit('destroyed');
  }

  private setupEventListeners(): void {
    // Forward events from components
    this.registry.on('toolRegistered', (tool: ITool) => {
      this.emit('toolRegistered', tool);
    });

    this.registry.on('toolUnregistered', (toolId: string) => {
      this.emit('toolUnregistered', toolId);
    });

    this.orchestrator.on('toolExecutionStarted', (data: unknown) => {
      this.emit('toolExecutionStarted', data);
    });

    this.orchestrator.on('toolExecutionCompleted', (data: unknown) => {
      this.emit('toolExecutionCompleted', data);
    });

    this.orchestrator.on('toolExecutionFailed', (data: unknown) => {
      this.emit('toolExecutionFailed', data);
    });

    if (this.stateManager) {
      this.stateManager.on('stateChanged', (data: unknown) => {
        this.emit('stateChanged', data);
      });
    }

    if (this.errorTracker) {
      this.errorTracker.on('errorCaptured', (error: unknown) => {
        this.emit('errorCaptured', error);
      });
    }
  }

  // Getters for advanced usage
  public get toolRegistry(): ToolRegistry {
    return this.registry;
  }

  public get toolLoader(): ToolLoader {
    return this.loader;
  }

  public get toolOrchestrator(): ToolOrchestrator {
    return this.orchestrator;
  }

  public get stateManagerInstance(): StateManager | undefined {
    return this.stateManager;
  }

  public get metricsCollectorInstance(): MetricsCollector | undefined {
    return this.metricsCollector;
  }

  public get tracingManagerInstance(): TracingManager | undefined {
    return this.tracingManager;
  }

  public get errorTrackerInstance(): ErrorTracker | undefined {
    return this.errorTracker;
  }
}

// Create a default instance for convenience
export function createHaloTools(config?: HaloToolsConfig): HaloToolsCore {
  return new HaloToolsCore({
    enableMetrics: true,
    enableTracing: false,
    enableErrorTracking: false,
    enableStateManagement: false,
    ...config,
  });
}
